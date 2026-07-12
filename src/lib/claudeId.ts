import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { allSpeciesIds, SPECIES } from '../data/species';
import type { BaitKind } from '../db/types';
import type { AiModelChoice } from '../stores/settingsStore';
import { getApiKey } from './aiKey';

const MODEL_IDS: Record<AiModelChoice, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5',
};

const BAIT_VALUES = ['fly', 'grub', 'worm', 'lure', 'live', 'none_visible'] as const;

export type FishIdResult = {
  speciesTop3: { speciesId: string; confidence: number }[];
  bait: BaitKind | null;
};

/** Thrown for a genuine failure (network, auth, bad response) → queue retry. */
export class FishIdError extends Error {}

/** Compact catalog (id + common name) as the system prompt, prompt-cached. */
function catalogText(): string {
  return SPECIES.filter((s) => s.id !== 'other')
    .map((s) => `${s.id}: ${s.common}`)
    .join('\n');
}

async function toBase64Jpeg(photoUri: string): Promise<string> {
  const src = photoUri.startsWith('file://') ? photoUri : `file://${photoUri}`;
  const context = ImageManipulator.manipulate(src);
  context.resize({ width: 1024 });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  if (!result.base64) throw new FishIdError('Could not encode the photo.');
  return result.base64;
}

function parseToolResult(json: unknown): FishIdResult {
  const content = (json as { content?: unknown[] })?.content ?? [];
  const tool = content.find(
    (b): b is { type: string; name: string; input: Record<string, unknown> } =>
      typeof b === 'object' && b !== null && (b as { type?: string }).type === 'tool_use'
  );
  if (!tool) throw new FishIdError('No identification returned.');
  const input = tool.input as {
    species_top3?: { species_id?: string; confidence?: number }[];
    bait?: string;
  };
  const validIds = new Set(allSpeciesIds());
  const speciesTop3 = (input.species_top3 ?? [])
    .filter((s) => s.species_id && validIds.has(s.species_id))
    .map((s) => ({ speciesId: s.species_id as string, confidence: Number(s.confidence) || 0 }))
    .slice(0, 3);
  const baitRaw = input.bait;
  const bait: BaitKind | null =
    baitRaw && baitRaw !== 'none_visible' && BAIT_VALUES.includes(baitRaw as never)
      ? (baitRaw as BaitKind)
      : null;
  return { speciesTop3, bait };
}

/**
 * Identifies species (+ any visible bait) from the catch photo via the
 * Anthropic Messages API with a strict tool schema constrained to the bundled
 * species list. Raw fetch (Hermes-safe). The photo leaves the device only for
 * this call and only when the user has kept a catch with a key configured.
 */
export async function identifyFish(params: {
  photoUri: string;
  lengthCm: number;
  model: AiModelChoice;
  signal?: AbortSignal;
}): Promise<FishIdResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new FishIdError('No API key configured.');

  const imageBase64 = await toBase64Jpeg(params.photoUri);

  const body = {
    model: MODEL_IDS[params.model],
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text:
          'You identify North American freshwater fish from a photo. Only use ids from this list:\n' +
          catalogText(),
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'report_fish_id',
        description: 'Report the most likely species and any visible bait.',
        input_schema: {
          type: 'object',
          properties: {
            species_top3: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  species_id: { type: 'string', enum: allSpeciesIds() },
                  confidence: { type: 'number' },
                },
                required: ['species_id', 'confidence'],
              },
            },
            bait: { type: 'string', enum: BAIT_VALUES },
          },
          required: ['species_top3', 'bait'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_fish_id' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          {
            type: 'text',
            text: `This fish measured ${params.lengthCm.toFixed(1)} cm tip to tail — use as a size prior. Identify the species and any visible bait/lure.`,
          },
        ],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  } catch (e) {
    throw new FishIdError(`Network error: ${String(e)}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new FishIdError(`API ${response.status}: ${text.slice(0, 200)}`);
  }
  const json = await response.json();
  return parseToolResult(json);
}

/** One-token ping to validate a key from the Settings screen. */
export async function testApiKey(apiKey: string, model: AiModelChoice): Promise<boolean> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_IDS[model],
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
  // 200 = valid; anything else (esp. 401) = invalid/unusable.
  return response.ok;
}
