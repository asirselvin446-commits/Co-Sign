import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/models.dart';
import '../../core/providers.dart';

/// Start a sensitive action: collect device signals, ask the server for a risk assessment and open
/// the safety-check screen. Resolves with the finished request (or null if the person left).
/// Throws [AppFailure] when the server refuses up front (e.g. a recovery is in progress).
Future<StepupView?> runSensitiveAction(BuildContext context, WidgetRef ref, String action, [Json params = const {}]) async {
  final signals = await ref.read(signalCollectorProvider).collect(withIntegrity: true);
  final start = await ref.read(apiProvider).startStepup(action, params, signals);
  if (!context.mounted) return null;
  final done = await context.push<StepupView>('/stepup/${start.request.id}', extra: start);
  ref.read(pasteTrackerProvider).reset();
  return done;
}
