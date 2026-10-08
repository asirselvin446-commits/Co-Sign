import CallKit
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "CoSignSignals") {
      SignalsPlugin.register(with: registrar)
    }
  }
}

/// iOS side of the "app.cosign/signals" channel.
///
/// iOS only lets apps observe call state (CXCallObserver): whether a call is active and how long
/// it has lasted. Remote-access apps, screen recording of other apps, SIM identity and Play
/// Integrity have no public iOS equivalent, so those signals are simply absent (reduced coverage,
/// documented in docs/threat-model.md). The number of the other party is never available.
final class SignalsPlugin: NSObject, FlutterPlugin, FlutterStreamHandler, CXCallObserverDelegate {
  private let observer = CXCallObserver()
  private var connectedAt: [UUID: Date] = [:]
  private var sink: FlutterEventSink?

  static func register(with registrar: FlutterPluginRegistrar) {
    let instance = SignalsPlugin()
    let methods = FlutterMethodChannel(name: "app.cosign/signals", binaryMessenger: registrar.messenger())
    let events = FlutterEventChannel(name: "app.cosign/signals/events", binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(instance, channel: methods)
    events.setStreamHandler(instance)
    instance.observer.setDelegate(instance, queue: nil)
    NotificationCenter.default.addObserver(
      instance, selector: #selector(instance.didTakeScreenshot),
      name: UIApplication.userDidTakeScreenshotNotification, object: nil)
    NotificationCenter.default.addObserver(
      instance, selector: #selector(instance.captureChanged),
      name: UIScreen.capturedDidChangeNotification, object: nil)
  }

  private var lastScreenshot: Date?

  @objc private func didTakeScreenshot() {
    lastScreenshot = Date()
    sink?(["type": "screen_captured"])
  }

  @objc private func captureChanged() {
    sink?(["type": "screen_recording", "active": UIScreen.main.isCaptured])
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "getSnapshot":
      result(snapshot())
    case "permissionStatus":
      result(["phoneState": true, "callLog": false, "contacts": false, "usageStats": false])
    case "requestPermissions":
      result(true)
    case "isDeviceSecure":
      result(nil)
    case "setSecure", "openUsageAccessSettings", "integrityToken":
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func snapshot() -> [String: Any] {
    let now = Date()
    let active = observer.calls.filter { $0.hasConnected && !$0.hasEnded }
    let longest = active.compactMap { connectedAt[$0.uuid] }.min()
    let recentScreenshot = lastScreenshot.map { now.timeIntervalSince($0) < 120 } ?? false
    return [
      "call": [
        "active": !active.isEmpty,
        "durationSec": Int(longest.map { now.timeIntervalSince($0) } ?? 0),
        "numberKnown": "unavailable",
      ],
      "screen": ["captureDetected": recentScreenshot, "recordingActive": UIScreen.main.isCaptured],
    ]
  }

  func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
    if call.hasConnected && !call.hasEnded && connectedAt[call.uuid] == nil {
      connectedAt[call.uuid] = Date()
    }
    if call.hasEnded { connectedAt.removeValue(forKey: call.uuid) }
    sink?(["type": "call_state", "active": call.hasConnected && !call.hasEnded])
  }

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    sink = events
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    sink = nil
    return nil
  }
}
