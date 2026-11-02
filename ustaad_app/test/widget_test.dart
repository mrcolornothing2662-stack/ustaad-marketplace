import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ustaad_provider/marketplace.dart';

void main() {
  testWidgets('login and role-specific registration forms', (tester) async {
    await tester.pumpWidget(
        MaterialApp(home: LoginPage(provider: true, onLogin: (_) {})));
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();
    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('Full name'), findsOneWidget);
    expect(find.text('Phone, including country code'), findsOneWidget);
  });
  testWidgets('booking request retains required appointment step',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: CreateBooking(
            providerId: 'provider',
            serviceId: 'service',
            latitude: '30.9',
            longitude: '75.85')));
    expect(find.text('Choose date & time'), findsOneWidget);
    await tester.tap(find.text('Send booking request'));
    await tester.pump();
    expect(find.textContaining('Choose appointment date and time'),
        findsOneWidget);
  });
}
