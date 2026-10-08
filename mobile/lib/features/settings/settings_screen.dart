import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../core/session/session_controller.dart';
import '../../ui/widgets.dart';
import '../onboarding/onboarding_screens.dart';
import '../stepup/stepup_flow.dart';

final consentProvider = FutureProvider.autoDispose<ConsentState>((ref) => ref.watch(apiProvider).consent());

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  AppFailure? _error;
  List<String>? _codes;

  Future<void> _guard(Future<void> Function() fn) async {
    setState(() => _error = null);
    try {
      await fn();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  Future<String?> _ask(String label, {TextInputType? keyboard}) =>
      showDialog<String>(context: context, builder: (_) => _AskDialog(label: label, keyboard: keyboard));

  Future<void> _changePhone() => _guard(() async {
        final phone = await _ask(context.l10n.phoneLabel, keyboard: TextInputType.phone);
        if (phone == null || phone.isEmpty || !mounted) return;
        final done = await runSensitiveAction(context, ref, 'change_phone', {'phone': toAsciiDigits(phone).replaceAll(' ', '')});
        if (done?.result?['verificationSent'] == true && mounted) {
          final code = await _ask(context.l10n.smsCodeLabel, keyboard: TextInputType.number);
          if (code == null || code.isEmpty) return;
          await ref.read(apiProvider).verifyPhone(code);
          if (mounted) showMessage(context, context.l10n.phoneVerified);
        }
      });

  Future<void> _changeEmail() => _guard(() async {
        final email = await _ask(context.l10n.emailLabel, keyboard: TextInputType.emailAddress);
        if (email == null || email.isEmpty || !mounted) return;
        await runSensitiveAction(context, ref, 'change_email', {'email': email});
      });

  Future<void> _recoveryCodes() => _guard(() async {
        final done = await runSensitiveAction(context, ref, 'view_recovery_codes');
        final codes = (done?.result?['codes'] as List<Object?>?)?.cast<String>();
        if (codes != null && mounted) setState(() => _codes = codes);
      });

  Future<void> _export() => _guard(() async {
        final data = await ref.read(apiProvider).exportData();
        await Clipboard.setData(ClipboardData(text: const JsonEncoder.withIndent('  ').convert(data)));
        if (mounted) showMessage(context, context.l10n.exportReady);
      });

  Future<void> _delete() => _guard(() async {
        if (!await confirmDialog(context, context.l10n.deleteConfirm, danger: true)) return;
        if (!mounted) return;
        final done = await runSensitiveAction(context, ref, 'delete_account');
        if (done?.status == StepupStatus.completed) await ref.read(sessionProvider.notifier).signOut();
      });

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final settings = ref.watch(settingsProvider);
    final notifier = ref.read(settingsProvider.notifier);
    final consent = ref.watch(consentProvider);
    return AppPage(
      title: l.settingsTitle,
      children: [
        if (_error != null) ...[FailureCard(failure: _error!), const Gap()],
        SectionTitle(l.language),
        RadioGroup<String>(
          groupValue: settings.language,
          onChanged: (v) {
            unawaited(notifier.update(settings.copyWith(language: v)));
            unawaited(ref.read(apiProvider).updateMe(locale: v).catchError((Object _) {}));
          },
          child: Column(children: [for (final (code, name) in languages) RadioListTile<String>(value: code, title: Text(name))]),
        ),
        SwitchListTile(
          title: Text(l.voice),
          value: settings.voiceOn,
          onChanged: (v) => notifier.update(settings.copyWith(voiceOn: v)),
        ),
        SpeakButton(key: ValueKey(settings.language), text: l.welcomeBody),
        SectionTitle(l.textSize),
        SegmentedButton<double>(
          segments: [
            ButtonSegment(value: 1.0, label: Text(l.textSizeNormal)),
            ButtonSegment(value: 1.2, label: Text(l.textSizeLarge)),
            ButtonSegment(value: 1.45, label: Text(l.textSizeLargest)),
          ],
          selected: {settings.textScale},
          onSelectionChanged: (s) => notifier.update(settings.copyWith(textScale: s.first)),
        ),
        SectionTitle(l.safetyChecks),
        AsyncBody<ConsentState>(
          value: consent,
          onRetry: () => ref.invalidate(consentProvider),
          builder: (c) => SwitchListTile(
            title: Text(l.safetyChecks),
            subtitle: Text(c.granted ? l.safetyChecksOn : l.safetyChecksOff),
            value: c.granted,
            onChanged: (v) => _guard(() async {
              await ref.read(apiProvider).setConsent(v, c.currentVersion);
              ref.invalidate(consentProvider);
            }),
          ),
        ),
        ListTile(title: Text(l.permissions), trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/settings/permissions')),
        SectionTitle(l.account),
        ListTile(title: Text(l.changePhone), onTap: _changePhone),
        ListTile(title: Text(l.changeEmail), onTap: _changeEmail),
        ListTile(title: Text(l.recoveryCodes), onTap: _recoveryCodes),
        if (_codes != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                BodyText(l.recoveryCodesWarning, emphasis: true),
                const Gap(8),
                for (final c in _codes!) SelectableText(c, style: const TextStyle(fontSize: 22, fontFamily: 'monospace', letterSpacing: 2)),
              ]),
            ),
          ),
        SectionTitle(l.privacy),
        ListTile(title: Text(l.exportData), leading: const Icon(Icons.download), onTap: _export),
        ListTile(
          title: Text(l.deleteAccount, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          leading: Icon(Icons.delete_forever, color: Theme.of(context).colorScheme.error),
          onTap: _delete,
        ),
        const Gap(),
        SecondaryButton(label: l.signOut, icon: Icons.logout, onPressed: () => ref.read(sessionProvider.notifier).signOut()),
      ],
    );
  }
}

/// One-field dialog. It owns its text controller, so the controller lives until the dialog has
/// finished closing (disposing it when the dialog's future completes is too early).
class _AskDialog extends StatefulWidget {
  const _AskDialog({required this.label, this.keyboard});
  final String label;
  final TextInputType? keyboard;
  @override
  State<_AskDialog> createState() => _AskDialogState();
}

class _AskDialogState extends State<_AskDialog> {
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        content: TextField(controller: _c, autofocus: true, keyboardType: widget.keyboard, decoration: InputDecoration(labelText: widget.label)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(context.l10n.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, _c.text.trim()), child: Text(context.l10n.continueLabel)),
        ],
      );
}
