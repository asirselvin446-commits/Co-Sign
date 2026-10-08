import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/models.dart';
import '../../core/errors/failure.dart';
import '../../core/providers.dart';
import '../../ui/widgets.dart';
import '../stepup/stepup_flow.dart';

final devicesProvider = FutureProvider.autoDispose<List<DeviceView>>((ref) => ref.watch(apiProvider).devices());

class DevicesScreen extends ConsumerStatefulWidget {
  const DevicesScreen({super.key});
  @override
  ConsumerState<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends ConsumerState<DevicesScreen> {
  AppFailure? _error;
  String? _linkCode;

  Future<void> _guard(Future<void> Function() fn) async {
    setState(() => _error = null);
    try {
      await fn();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f);
    }
  }

  Future<void> _addPhone() => _guard(() async {
        final done = await runSensitiveAction(context, ref, 'add_device');
        final code = done?.result?['code'] as String?;
        if (code != null && mounted) setState(() => _linkCode = code);
      });

  Future<void> _addPasskey() => _guard(() async {
        final done = await runSensitiveAction(context, ref, 'add_passkey');
        final options = done?.result?['registrationOptions'] as Json?;
        if (options == null) return;
        final response = await ref.read(passkeysProvider).register(options);
        await ref.read(apiProvider).registerExtraPasskey(response);
        if (mounted) showMessage(context, context.l10n.passkeyAdded);
      });

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final lang = ref.watch(settingsProvider).language;
    final devices = ref.watch(devicesProvider);
    return AppPage(
      title: l.phonesTitle,
      children: [
        if (_error != null) ...[FailureCard(failure: _error!), const Gap()],
        if (_linkCode != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l.linkCodeTitle, style: Theme.of(context).textTheme.titleMedium),
                const Gap(8),
                SelectableText(
                  '${_linkCode!.substring(0, 4)} ${_linkCode!.substring(4)}',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(letterSpacing: 6, fontWeight: FontWeight.w700),
                  semanticsLabel: _linkCode!.split('').join(' '),
                ),
                const Gap(8),
                BodyText(l.linkCodeBody),
              ]),
            ),
          ),
        AsyncBody<List<DeviceView>>(
          value: devices,
          onRetry: () => ref.invalidate(devicesProvider),
          builder: (list) => Column(children: [
            for (final d in list)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(d.platform == 'ios' ? Icons.phone_iphone : Icons.phone_android),
                title: Text(d.current ? '${d.name} · ${l.thisPhone}' : d.name),
                subtitle: Text('${l.addedOn(formatClock(d.enrolledAt, lang))}\n${l.lastUsedOn(formatClock(d.lastSeenAt, lang))}'),
                isThreeLine: true,
                trailing: d.current
                    ? null
                    : IconButton(
                        tooltip: '${l.remove} ${d.name}',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => _guard(() async {
                          if (!await confirmDialog(context, l.removePhoneConfirm, danger: true)) return;
                          await ref.read(apiProvider).removeDevice(d.id);
                          ref.invalidate(devicesProvider);
                        }),
                      ),
              ),
          ]),
        ),
        const Gap(),
        SecondaryButton(label: l.addPhone, icon: Icons.add_to_home_screen, onPressed: _addPhone),
        const Gap(12),
        SecondaryButton(label: l.addPasskey, icon: Icons.key, onPressed: _addPasskey),
      ],
    );
  }
}
