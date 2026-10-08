import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/session/session_controller.dart';
import '../../ui/widgets.dart';

/// "I lost my phone", run on the new phone. The handle is sent; guardians approve; after the cancel
/// window this phone registers a passkey and every old phone is signed out.
class RecoveryScreen extends ConsumerStatefulWidget {
  const RecoveryScreen({super.key});
  @override
  ConsumerState<RecoveryScreen> createState() => _RecoveryScreenState();
}

class _RecoveryScreenState extends ConsumerState<RecoveryScreen> {
  final _handle = TextEditingController();
  final _code = TextEditingController();
  RecoveryStart? _start;
  RecoveryStatus? _status;
  AppFailure? _error;
  bool _busy = false;
  bool _showCode = false;
  Timer? _poll;

  @override
  void dispose() {
    _poll?.cancel();
    _handle.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _begin() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final s = await ref.read(apiProvider).startRecovery(_handle.text.trim().toLowerCase(), await ref.read(deviceInfoProvider)());
      setState(() {
        _start = s;
        _status = const RecoveryStatus('pending_approvals', 0, null);
      });
      // The new phone is not signed in, so it polls (no socket).
      _poll = Timer.periodic(const Duration(seconds: 10), (_) => unawaited(_refresh()));
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refresh() async {
    final s = _start;
    if (s == null) return;
    try {
      final st = await ref.read(apiProvider).recoveryStatus(s.recoveryId, s.pollToken);
      if (mounted) setState(() => _status = st);
    } on AppFailure catch (f) {
      _poll?.cancel();
      if (mounted) setState(() => _error = f);
    }
  }

  Future<void> _submitCode() async {
    final s = _start!;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiProvider).recoveryCode(s.recoveryId, s.pollToken, _code.text.trim());
      await _refresh();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finish() async {
    final s = _start!;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final options = await api.recoveryRegisterOptions(s.recoveryId, s.pollToken);
      final response = await ref.read(passkeysProvider).register(options);
      final result = await api.recoveryRegisterVerify(s.recoveryId, s.pollToken, response);
      _poll?.cancel();
      await ref.read(sessionProvider.notifier).completeAuth(result);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final st = _status;
    if (_start == null) {
      return AppPage(
        title: l.recoveryTitle,
        bottom: PrimaryButton(label: l.recoveryStart, busy: _busy, onPressed: _begin),
        children: [
          BodyText(l.recoveryIntro),
          const Gap(),
          TextField(
            controller: _handle,
            decoration: InputDecoration(labelText: l.handleLabel),
            autocorrect: false,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[a-zA-Z0-9._@]')), LengthLimitingTextInputFormatter(31)],
          ),
          if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
        ],
      );
    }
    final ready = st?.status == 'ready';
    return AppPage(
      title: l.recoveryTitle,
      bottom: ready ? PrimaryButton(label: l.createPasskey, icon: Icons.fingerprint, busy: _busy, onPressed: _finish) : null,
      children: [
        if (st?.status == 'pending_approvals') ...[
          Row(children: [
            const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 3)),
            const SizedBox(width: 12),
            Expanded(child: BodyText(l.recoveryWaiting, emphasis: true)),
          ]),
          const Gap(8),
          BodyText(l.recoveryWaitingBody),
          SpeakButton(text: l.recoveryWaitingBody, autoSpeak: true),
          Semantics(liveRegion: true, child: BodyText(l.recoveryApprovals(st!.approvals))),
          const Gap(),
          if (!_showCode)
            TextButton(onPressed: () => setState(() => _showCode = true), child: Text(l.recoveryCodeOption))
          else ...[
            TextField(
              controller: _code,
              decoration: InputDecoration(labelText: l.recoveryCodeLabel),
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [LengthLimitingTextInputFormatter(20)],
            ),
            const Gap(10),
            SecondaryButton(label: l.submit, onPressed: _busy ? null : _submitCode),
          ],
        ],
        if (st?.status == 'cancel_window' && st?.completesAt != null) ...[
          Semantics(liveRegion: true, child: BodyText(l.recoveryCancelWindow(formatClock(st!.completesAt!, lang)), emphasis: true)),
        ],
        if (ready) BodyText(l.recoveryReady, emphasis: true),
        if (_error != null) ...[const Gap(), FailureCard(failure: _error!)],
      ],
    );
  }
}
