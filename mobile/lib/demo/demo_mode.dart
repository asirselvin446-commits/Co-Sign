import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;

import '../core/config.dart';
import '../core/providers.dart';
import '../core/session/session_store.dart';
import 'demo_backend.dart';

/// Offline presentation build: flutter build apk --dart-define=DEMO_MODE=true
const bool kDemoMode = bool.fromEnvironment('DEMO_MODE');

/// True when the in-memory demo backend is in use (shows the DEMO ribbon and scam switch).
final demoModeProvider = Provider<bool>((_) => false);
final demoScenarioProvider = Provider<DemoScenario>((_) => DemoScenario());
final _demoRealtimeProvider = Provider<DemoRealtime>((_) => DemoRealtime());

List<Override> demoOverrides() => [
      demoModeProvider.overrideWithValue(true),
      configProvider.overrideWithValue(const AppConfig(apiBaseUrl: 'demo://offline')),
      // Fresh start on every launch: the jury sees onboarding and sign-in each time.
      secretStoreProvider.overrideWithValue(MemorySecretStore()),
      realtimeProvider.overrideWith((ref) => ref.watch(_demoRealtimeProvider)),
      apiProvider.overrideWith((ref) => DemoCoSignApi(language: () => ref.read(settingsProvider).language, realtime: ref.watch(_demoRealtimeProvider))),
      passkeysProvider.overrideWithValue(DemoPasskeyService()),
      signalsChannelProvider.overrideWith((ref) => DemoSignalsChannel(ref.watch(demoScenarioProvider))),
      pushProvider.overrideWithValue(DemoPush()),
    ];

/// "DEMO" ribbon plus a switch to simulate a scam call (unknown caller + screen-control app),
/// which makes the next protected action need a guardian.
class DemoOverlay extends ConsumerStatefulWidget {
  const DemoOverlay({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<DemoOverlay> createState() => _DemoOverlayState();
}

class _DemoOverlayState extends ConsumerState<DemoOverlay> {
  @override
  Widget build(BuildContext context) {
    final scenario = ref.watch(demoScenarioProvider);
    final on = scenario.scamCall;
    return Banner(
      message: 'DEMO',
      location: BannerLocation.topEnd,
      color: const Color(0xFFB3261E),
      child: Stack(children: [
        widget.child,
        // A small tab on the left edge, so it never covers buttons.
        Positioned(
          left: 0,
          top: MediaQuery.sizeOf(context).height * 0.42,
          child: Semantics(
            button: true,
            label: on ? 'Demo: scam call ON' : 'Demo: scam call OFF',
            child: Material(
              color: on ? const Color(0xFFB3261E) : const Color(0xFF37474F),
              borderRadius: const BorderRadius.horizontal(right: Radius.circular(24)),
              elevation: 6,
              child: InkWell(
                borderRadius: const BorderRadius.horizontal(right: Radius.circular(24)),
                onTap: () => setState(() => scenario.scamCall = !on),
                child: SizedBox(
                  width: 48,
                  height: 56,
                  child: Icon(on ? Icons.phone_in_talk : Icons.phone_disabled, color: Colors.white, semanticLabel: on ? 'Demo: scam call ON' : 'Demo: scam call OFF'),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
