import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabsParamList = {
  Measure: undefined;
  Log: undefined;
  Map: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList>;
  CaptureReview: { draftId: string };
  CatchDetail: { catchId: string };
  /** Species chooser. `target` says who receives the pick. */
  SpeciesPicker:
    | { target: 'draft'; draftId: string; suggestions?: string[] }
    | { target: 'catch'; catchId: string; suggestions?: string[] };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
