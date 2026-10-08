import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../ui/widgets.dart';
import 'account_tab.dart';
import 'family_tab.dart';
import 'protection_tab.dart';

/// The app's home: three tabs. Protection is for the person on this phone, Family is for the
/// people they guard, and Account holds phones, guardians and settings.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, this.tab});

  /// "protection", "family" or "account" (from /home?tab=...).
  final String? tab;

  static const tabs = ['protection', 'family', 'account'];

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late int _index = _fromRoute(widget.tab);
  StreamSubscription<Object>? _events;

  static int _fromRoute(String? tab) => (HomeScreen.tabs.indexOf(tab ?? '')).clamp(0, 2);

  @override
  void didUpdateWidget(HomeScreen old) {
    super.didUpdateWidget(old);
    if (old.tab != widget.tab && widget.tab != null) _index = _fromRoute(widget.tab);
  }

  @override
  void initState() {
    super.initState();
    // Live updates: refresh whichever lists the event touches.
    _events = ref.read(realtimeProvider).events.listen((e) {
      if (e.name.startsWith('guardian.') || e.name == 'guarding.changed') refreshFamily(ref);
      if (e.name.startsWith('stepup.') || e.name.startsWith('recovery.') || e.name == 'monitor.pause') refreshProtection(ref);
    });
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final titles = [l.tabProtection, l.tabFamily, l.tabAccount];
    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_index]),
        actions: [
          if (_index != 2) IconButton(tooltip: l.settings, icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/settings')),
        ],
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _index,
          children: const [ProtectionTab(), FamilyTab(), AccountTab()],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.shield_outlined), selectedIcon: const Icon(Icons.shield), label: l.tabProtection),
          NavigationDestination(icon: const Icon(Icons.diversity_1_outlined), selectedIcon: const Icon(Icons.diversity_1), label: l.tabFamily),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l.tabAccount),
        ],
      ),
    );
  }
}

/// A scrollable, readable-width column used by each tab.
class TabBody extends StatelessWidget {
  const TabBody({super.key, required this.children, required this.onRefresh});
  final List<Widget> children;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: onRefresh,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: children),
          ),
        ),
      );
}
