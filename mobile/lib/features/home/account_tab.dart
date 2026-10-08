import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/session_controller.dart';
import '../../ui/widgets.dart';
import 'home_screen.dart';

/// Who I am, and where things are set up: my guardians, my phones, protection, settings.
class AccountTab extends ConsumerWidget {
  const AccountTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final user = ref.watch(sessionProvider).user;
    final rows = [
      (Icons.diversity_1_outlined, l.guardians, l.guardiansIntro, '/guardians'),
      (Icons.shield_outlined, l.familyProtection, l.fpWho, '/protection'),
      (Icons.phone_android, l.phones, null, '/devices'),
      (Icons.travel_explore, l.checkLink, l.checkLinkNote, '/check-link'),
      (Icons.volunteer_activism_outlined, l.beGuardian, null, '/guardian/accept'),
      (Icons.settings_outlined, l.settings, null, '/settings'),
    ];
    return TabBody(
      onRefresh: () async {},
      children: [
        if (user != null) ...[
          const Gap(8),
          Text(user.displayName, style: Theme.of(context).textTheme.headlineMedium),
          const Gap(4),
          Text('@${user.handle}', style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const Gap(),
        ],
        for (final (icon, title, subtitle, route) in rows) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(icon, size: 28),
            title: Text(title, style: Theme.of(context).textTheme.titleMedium),
            subtitle: subtitle == null ? null : Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(route),
          ),
          const Divider(),
        ],
        const Gap(24),
        SecondaryButton(label: l.signOut, icon: Icons.logout, onPressed: () => ref.read(sessionProvider.notifier).signOut()),
      ],
    );
  }
}
