import Foundation

struct StabilityStatus {
  var stable = false
  var stableForMs = 0.0
  var windowMedianCurvedM = 0.0
  var windowStdDevM = 0.0
  var windowFrames = 0
}

/// Decides when the measurement is trustworthy enough for auto-capture:
/// enough consecutive frames, tight curved-length spread, good depth
/// coverage, and camera inside the LiDAR sweet spot. JS edge-detects the
/// `stable` flag and fires the capture (respecting the auto-capture setting).
final class StabilityGate {
  private struct Sample {
    let time: Double // seconds
    let curved: Double
    let coverage: Double
    let distance: Double
  }

  var config = StabilityConfig()
  private var samples: [Sample] = []
  private var stableSince: Double?

  func reset() {
    samples.removeAll()
    stableSince = nil
  }

  func add(curvedM: Double, coverage: Double, distanceM: Double, timestamp: Double) -> StabilityStatus {
    let windowSec = config.windowMs / 1000
    samples.append(Sample(time: timestamp, curved: curvedM, coverage: coverage, distance: distanceM))
    samples.removeAll { timestamp - $0.time > windowSec }

    var status = StabilityStatus(windowFrames: samples.count)
    let curves = samples.map(\.curved).sorted()
    guard !curves.isEmpty else { return status }
    let median = curves[curves.count / 2]
    status.windowMedianCurvedM = median
    let mean = samples.map(\.curved).reduce(0, +) / Double(samples.count)
    status.windowStdDevM = (samples.map { ($0.curved - mean) * ($0.curved - mean) }
      .reduce(0, +) / Double(samples.count)).squareRoot()

    let spanOK = samples.count >= 3 && (timestamp - samples[0].time) >= windowSec * 0.8
    let spread = (curves.last ?? 0) - (curves.first ?? 0)
    let spreadOK = spread <= max(config.maxDeltaCm / 100, config.maxDeltaFraction * median)
    let coverageOK = samples.allSatisfy { $0.coverage >= config.minDepthCoverage }
    let distanceOK = samples.allSatisfy {
      $0.distance >= config.minDistanceM && $0.distance <= config.maxDistanceM
    }

    if spanOK && spreadOK && coverageOK && distanceOK {
      if stableSince == nil {
        stableSince = timestamp
      }
      status.stable = true
      status.stableForMs = (timestamp - (stableSince ?? timestamp)) * 1000
    } else {
      stableSince = nil
    }
    return status
  }
}
