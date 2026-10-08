import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/providers.dart';
import 'core/settings/settings.dart';
import 'demo/demo.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([initializeDateFormatting('en_IN'), initializeDateFormatting('ta_IN'), initializeDateFormatting('hi_IN')]);
  final settings = await PrefsSettingsStore().load();
  runApp(
    ProviderScope(
      overrides: [initialSettingsProvider.overrideWithValue(settings), if (kDemoMode) ...demoOverrides()],
      child: kDemoMode ? const DemoBanner(child: CoSignApp()) : const CoSignApp(),
    ),
  );
}
