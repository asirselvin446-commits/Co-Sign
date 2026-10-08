import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/signals/signal_collector.dart';
import '../../core/voice/voice.dart';
import '../../generated/catalog.g.dart';
import '../../ui/widgets.dart';

/// The safety check. Shows (and reads aloud) why an action was paused, asks for the person's own
/// passkey, then follows the request live: guardian approval, cool-off, confirm, done.
/// No time limit is imposed on the person: waiting and cancelling are always possible.
class StepupScreen extends ConsumerStatefulWidget {
  const StepupScreen({super.key, required this.requestId, this.start});
  final String requestId;
  final StepupStart? start;

  @override
  ConsumerState<StepupScreen> createState() => _StepupScreenState();
}

class _StepupScreenState extends ConsumerState<StepupScreen> {
  StepupView? _view;
  Json? _options;
  AppFailure? _error;
  bool _busy = false;
  SensitiveSession? _session;
  StreamSubscription<Object>? _events;
  Timer? _poll;
  bool _popped = false;
  // Read once while mounted: providers must not be read from dispose().
  late final Voice _voice = ref.read(voiceProvider);

  @override
  void initState() {
    super.initState();
    _voice;
    _view = widget.start?.request;
    _options = widget.start?.options;
    _session = SensitiveSession(collector: ref.read(signalCollectorProvider), api: ref.read(apiProvider), stepupId: widget.requestId);
    unawaited(_session!.start());
    _events = ref.read(realtimeProvider).events.where((e) => e.name == 'stepup.updated' && e.data['requestId'] == widget.requestId).listen((_) => unawaited(_refresh()));
    // Polling backs up the socket (e.g. on flaky mobile data).
    _poll = Timer.periodic(const Duration(seconds: 6), (_) {
      final s = _view?.status;
      if (s == StepupStatus.pendingGuardians || s == StepupStatus.cooloff) unawaited(_refresh());
    });
    if (_view == null) unawaited(_refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    unawaited(_events?.cancel());
    unawaited(_session?.stop());
    unawaited(_voice.stop());
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final v = await ref.read(apiProvider).stepup(widget.requestId);
      if (!mounted) return;
      setState(() {
        _view = v;
        _error = null;
      });
      _maybeFinish(v);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  void _maybeFinish(StepupView v) {
    if (v.status == StepupStatus.completed && !_popped) {
      _popped = true;
      // Give the "Done" state a moment on screen before returning the result to the caller.
      Future<void>.delayed(const Duration(milliseconds: 900), () {
        if (mounted && context.canPop()) context.pop(v);
      });
    }
  }

  Future<void> _confirm() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = ref.read(apiProvider);
    try {
      final options = _options ?? await api.stepupOptions(widget.requestId);
      final response = await ref.read(passkeysProvider).authenticate(options);
      final v = await api.verifyStepup(widget.requestId, response);
      _options = null;
      if (!mounted) return;
      setState(() => _view = v);
      _maybeFinish(v);
    } on AppFailure catch (f) {
      // A cancelled prompt invalidates nothing server-side, but the challenge was single use.
      _options = null;
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    setState(() => _busy = true);
    try {
      final v = await ref.read(apiProvider).cancelStepup(widget.requestId);
      if (mounted) setState(() => _view = v);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _clock(DateTime t) => formatClock(t, ref.read(settingsProvider).language);

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final v = _view;
    if (v == null) {
      return AppPage(title: l.stepupTitle, children: [if (_error != null) FailureCard(failure: _error!, onRetry: _refresh) else const LoadingView()]);
    }
    final reasonsSpoken = [...v.reasons.map((r) => r.text), if (v.reasons.isNotEmpty) l.hangUpAdvice].join(' ');
    final children = <Widget>[
      Semantics(header: true, child: Text(v.actionLabel, style: Theme.of(context).textTheme.headlineSmall)),
      const Gap(12),
      ..._statusSection(context, v),
      if (_error != null) ...[const Gap(16), FailureCard(failure: _error!)],
      if (v.reasons.isNotEmpty) ...[
        SectionTitle(l.whyPaused),
        ReasonList(reasons: v.reasons),
        SpeakButton(key: ValueKey('reasons-${v.reasons.length}'), text: reasonsSpoken, autoSpeak: v.status == StepupStatus.pendingUser),
        const Gap(8),
        Card(
          child: Padding(padding: const EdgeInsets.all(16), child: BodyText(l.hangUpAdvice, emphasis: true)),
        ),
      ],
    ];
    return AppPage(title: l.stepupTitle, bottom: _actions(context, v), children: children);
  }

  List<Widget> _statusSection(BuildContext context, StepupView v) {
    final l = context.l10n;
    switch (v.status) {
      case StepupStatus.pendingUser:
        return [BodyText(v.reasons.isEmpty ? l.noWarnings : l.riskScore(v.score))];
      case StepupStatus.pendingGuardians:
        return [
          Row(children: [
            const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 3)),
            const SizedBox(width: 12),
            Expanded(child: BodyText(l.waitingGuardian, emphasis: true)),
          ]),
          const Gap(8),
          BodyText(l.waitingGuardianBody),
          const Gap(8),
          Semantics(liveRegion: true, child: BodyText(l.guardiansAnswered(v.guardiansResponded, v.guardiansTotal))),
          BodyText(l.requestExpiresAt(_clock(v.expiresAt))),
        ];
      case StepupStatus.cooloff:
        final body = l.cooloffBody(_clock(v.coolOffUntil ?? v.expiresAt));
        return [
          BodyText(l.cooloffTitle, emphasis: true),
          const Gap(8),
          BodyText(body),
          SpeakButton(text: body, autoSpeak: true),
        ];
      case StepupStatus.readyToConfirm:
        return [BodyText(l.readyToConfirmTitle, emphasis: true), const Gap(8), BodyText(l.readyToConfirmBody)];
      case StepupStatus.completed:
      case StepupStatus.approved:
        return [Semantics(liveRegion: true, child: BodyText(l.completedTitle, emphasis: true))];
      case StepupStatus.denied:
      case StepupStatus.failed:
        return [
          BodyText(v.status == StepupStatus.denied ? l.deniedTitle : l.failedTitle, emphasis: true),
          const Gap(8),
          FailureCard(failure: v.failure ?? AppFailure(ErrorCodes.ACTION_NOT_COMPLETED)),
        ];
      case StepupStatus.cancelled:
        return [BodyText(l.cancelledTitle, emphasis: true)];
      case StepupStatus.expired:
        return [BodyText(l.expiredTitle, emphasis: true)];
    }
  }

  Widget? _actions(BuildContext context, StepupView v) {
    final l = context.l10n;
    final cancel = SecondaryButton(label: l.cancelAction, onPressed: _busy ? null : _cancel);
    switch (v.status) {
      case StepupStatus.pendingUser:
      case StepupStatus.readyToConfirm:
        return Column(mainAxisSize: MainAxisSize.min, children: [
          PrimaryButton(label: l.confirmWithPasskey, icon: Icons.fingerprint, busy: _busy, onPressed: _confirm),
          const Gap(10),
          cancel,
        ]);
      case StepupStatus.pendingGuardians:
      case StepupStatus.cooloff:
        return cancel;
      default:
        return PrimaryButton(label: l.close, onPressed: () => context.pop(v));
    }
  }
}
