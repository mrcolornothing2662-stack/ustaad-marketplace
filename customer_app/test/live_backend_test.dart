import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ustaad_customer/marketplace.dart';

void main() {
  testWidgets('sign in and load booking list against running backend',
      (tester) async {
    HttpOverrides.global = null;
    FlutterSecureStorage.setMockInitialValues({});
    api.access = null;
    api.refresh = null;
    await tester.pumpWidget(const MarketplaceApp(provider: false));
    Future<void> until(Finder finder) async {
      for (var i = 0; i < 100; i++) {
        await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 100)));
        await tester.pump(const Duration(milliseconds: 100));
        if (finder.evaluate().isNotEmpty) return;
      }
      fail('Expected widget did not appear: $finder');
    }

    await until(find.text('Welcome back'));
    await tester.enterText(
        find.widgetWithText(TextField, 'Email'), 'customer1@ustaad.local');
    await tester.enterText(
        find.widgetWithText(TextField, 'Password'), 'UstaadDev123!');
    await tester.tap(find.text('Sign in'));
    await until(find.text('Hello, Demo Customer 1'));
    await tester.tap(find.text('My bookings'));
    await until(find.text('No bookings yet.'));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  }, skip: !const bool.fromEnvironment('RUN_LIVE_TESTS'));
}
