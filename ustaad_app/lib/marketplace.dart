import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'config/app_config.dart';

class Api {
  final storage = const FlutterSecureStorage();
  String? access, refresh;
  Future<void>? renewing;
  Future<void> restore() async {
    access = await storage.read(key: 'access');
    refresh = await storage.read(key: 'refresh');
  }

  Future<void> session(Map<String, dynamic> t) async {
    access = t['accessToken'];
    refresh = t['refreshToken'];
    await storage.write(key: 'access', value: access);
    await storage.write(key: 'refresh', value: refresh);
  }

  Future<dynamic> call(
    String path, {
    String method = 'GET',
    dynamic body,
    bool retry = true,
  }) async {
    final request =
        http.Request(method, Uri.parse('${AppConfig.apiBaseUrl}$path'))
          ..headers.addAll({
            'content-type': 'application/json',
            if (access != null) 'authorization': 'Bearer $access'
          })
          ..body = body == null ? '' : jsonEncode(body);
    final response = await request.send().timeout(const Duration(seconds: 20));
    final text = await response.stream.bytesToString();
    dynamic data;
    try {
      data = text.isEmpty ? null : jsonDecode(text);
    } catch (_) {
      throw Exception(
          'The server returned an invalid response. Check the API address.');
    }
    if (response.statusCode == 401 && retry && refresh != null) {
      try {
        renewing ??= (() async {
          final t = await call('/auth/refresh',
              method: 'POST', body: {'refreshToken': refresh}, retry: false);
          await session(Map<String, dynamic>.from(t));
        })();
        try {
          await renewing;
        } finally {
          renewing = null;
        }
        return call(path, method: method, body: body, retry: false);
      } catch (_) {
        await clear();
        rethrow;
      }
    }
    if (response.statusCode >= 400) {
      throw Exception(
        data?['error']?['message'] ??
            data?['message'] ??
            'Request failed (${response.statusCode})',
      );
    }
    return data;
  }

  Future<void> clear() async {
    access = null;
    refresh = null;
    await storage.deleteAll();
  }
}

final api = Api();
String pretty(dynamic d) => const JsonEncoder.withIndent('  ').convert(d);
String label(String s) => s.replaceAll('_', ' ').toLowerCase();

class MarketplaceApp extends StatelessWidget {
  final bool provider;
  const MarketplaceApp({super.key, required this.provider});
  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: provider ? 'Ustaad Provider' : 'Ustaad Customer',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff125c50)),
          useMaterial3: true,
          inputDecorationTheme: const InputDecorationTheme(
            border: OutlineInputBorder(),
          ),
        ),
        home: SessionPage(provider: provider),
      );
}

class SessionPage extends StatefulWidget {
  final bool provider;
  const SessionPage({super.key, required this.provider});
  @override
  State<SessionPage> createState() => _SessionPageState();
}

class _SessionPageState extends State<SessionPage> {
  bool ready = false;
  Map<String, dynamic>? user;
  String? error;
  @override
  void initState() {
    super.initState();
    restore();
  }

  Future<void> restore() async {
    await api.restore();
    if (api.access != null) {
      try {
        user = Map<String, dynamic>.from(await api.call('/account/profile'));
      } catch (_) {
        await api.clear();
      }
    }
    if (mounted) setState(() => ready = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return user == null
        ? LoginPage(
            provider: widget.provider,
            onLogin: (u) => setState(() => user = u),
          )
        : Dashboard(
            user: user!,
            onLogout: () async {
              try {
                await api.call(
                  '/auth/logout',
                  method: 'POST',
                  body: {'refreshToken': api.refresh},
                );
              } catch (_) {}
              await api.clear();
              if (mounted) setState(() => user = null);
            },
          );
  }
}

class LoginPage extends StatefulWidget {
  final bool provider;
  final void Function(Map<String, dynamic>) onLogin;
  const LoginPage({super.key, required this.provider, required this.onLogin});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController(),
      phone = TextEditingController();
  bool register = false, busy = false;
  String? error;
  @override
  void dispose() {
    for (final c in [email, password, name, phone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final data = await api.call(
        register
            ? '/auth/register/${widget.provider ? 'provider' : 'customer'}'
            : '/auth/login',
        method: 'POST',
        body: {
          'email': email.text.trim(),
          'password': password.text,
          if (register) 'name': name.text.trim(),
          if (register) 'phone': phone.text.trim(),
        },
      );
      final u = Map<String, dynamic>.from(data['user']);
      if (u['role'] != 'ADMIN' &&
          u['role'] != (widget.provider ? 'PROVIDER' : 'CUSTOMER')) {
        throw Exception('Use the application matching your account role');
      }
      await api.session(Map<String, dynamic>.from(data['tokens']));
      widget.onLogin(u);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title:
              Text(widget.provider ? 'Ustaad • Provider' : 'Ustaad • Customer'),
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.all(24),
              shrinkWrap: true,
              children: [
                Text(
                  register ? 'Create your account' : 'Welcome back',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 24),
                if (register) ...[
                  input(name, 'Full name'),
                  input(phone, 'Phone, including country code'),
                ],
                input(email, 'Email'),
                input(password, 'Password', secret: true),
                if (error != null)
                  Text(error!, style: const TextStyle(color: Colors.red)),
                FilledButton(
                  onPressed: busy ? null : submit,
                  child: Text(
                    busy
                        ? 'Please wait…'
                        : register
                            ? 'Register'
                            : 'Sign in',
                  ),
                ),
                TextButton(
                  onPressed:
                      busy ? null : () => setState(() => register = !register),
                  child: Text(
                    register
                        ? 'Already have an account? Sign in'
                        : 'Create an account',
                  ),
                ),
                TextButton(
                  onPressed: () => push(context, const RecoveryPage()),
                  child: const Text('Forgot password?'),
                ),
              ],
            ),
          ),
        ),
      );
}

Widget input(
  TextEditingController c,
  String title, {
  bool secret = false,
  bool number = false,
}) =>
    Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: c,
        obscureText: secret,
        keyboardType: number
            ? const TextInputType.numberWithOptions(decimal: true, signed: true)
            : null,
        decoration: InputDecoration(labelText: title),
      ),
    );
Future<void> push(BuildContext c, Widget page) async {
  await Navigator.of(c).push(MaterialPageRoute<void>(builder: (_) => page));
}

Future<void> message(BuildContext c, String text) async {
  if (c.mounted) {
    await showDialog<void>(
      context: c,
      builder: (ctx) => AlertDialog(
        content: SelectableText(text),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

class Dashboard extends StatelessWidget {
  final Map<String, dynamic> user;
  final Future<void> Function() onLogout;
  const Dashboard({super.key, required this.user, required this.onLogout});
  @override
  Widget build(BuildContext c) {
    final provider = user['role'] == 'PROVIDER',
        admin = user['role'] == 'ADMIN';
    final pages = <String, Widget>{
      if (!admin)
        'Profile & phone verification': ProfilePage(provider: provider),
      if (!provider && !admin) 'Find a service': const SearchPage(),
      if (!admin) 'My bookings': BookingsPage(provider: provider),
      if (provider) 'Professional profile': const ProfessionalPage(),
      if (provider) 'Services & pricing': const ServicesPage(),
      if (provider) 'Availability & listing': const AvailabilityPage(),
      if (provider) 'Identity & skill verification': const VerificationPage(),
      if (provider)
        'Reviews': const DataPage(title: 'Reviews', path: '/account/reviews'),
      if (provider)
        'Trust score history': const DataPage(
          title: 'Trust score history',
          path: '/account/trust-history',
        ),
      if (!admin) 'Notifications': const NotificationPage(),
      if (!admin)
        'My complaints': const DataPage(
          title: 'My complaints',
          path: '/account/complaints',
        ),
      if (admin) 'Verification decisions': const AdminPage(),
      if (admin) 'Complaints & disputes': const AdminComplaintsPage(),
      if (admin)
        'Audit logs': const DataPage(
          title: 'Audit logs',
          path: '/admin/audit-logs',
        ),
    };
    return Scaffold(
      appBar: AppBar(
        title: Text(
          admin
              ? 'Ustaad Administration'
              : provider
                  ? 'Ustaad Provider'
                  : 'Ustaad Customer',
        ),
        actions: [
          IconButton(
            onPressed: onLogout,
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Hello, ${user['name']}',
            style: Theme.of(c).textTheme.headlineSmall,
          ),
          const SizedBox(height: 16),
          ...pages.entries.map(
            (e) => Card(
              child: ListTile(
                title: Text(e.key),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => push(c, e.value),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class DataPage extends StatefulWidget {
  final String title, path;
  const DataPage({super.key, required this.title, required this.path});
  @override
  State<DataPage> createState() => _DataPageState();
}

class _DataPageState extends State<DataPage> {
  late Future<dynamic> load;
  @override
  void initState() {
    super.initState();
    load = api.call(widget.path);
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(
          title: Text(widget.title),
          actions: [
            IconButton(
              onPressed: () => setState(() => load = api.call(widget.path)),
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: FutureBuilder<dynamic>(
          future: load,
          builder: (c, s) {
            if (s.hasError) return Center(child: Text('${s.error}'));
            if (!s.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            return SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: SelectableText(
                s.data is List && (s.data as List).isEmpty
                    ? 'No records yet.'
                    : pretty(s.data),
              ),
            );
          },
        ),
      );
}

// All editable forms below submit real API operations and retain entered values on failure.
class FormPage extends StatefulWidget {
  final String title, path, method;
  final Map<String, String> fields;
  final dynamic Function(Map<String, String>) body;
  const FormPage({
    super.key,
    required this.title,
    required this.path,
    required this.fields,
    required this.body,
    this.method = 'POST',
  });
  @override
  State<FormPage> createState() => _FormPageState();
}

class _FormPageState extends State<FormPage> {
  late Map<String, TextEditingController> controls;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    controls = widget.fields.map(
      (k, v) => MapEntry(k, TextEditingController(text: v)),
    );
  }

  @override
  void dispose() {
    for (final c in controls.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.call(
        widget.path,
        method: widget.method,
        body: widget.body(controls.map((k, v) => MapEntry(k, v.text.trim()))),
      );
      if (mounted) {
        await message(context, 'Saved successfully.');
        if (mounted) Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: Text(widget.title)),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            ...controls.entries.map((e) => input(e.value, e.key)),
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
            FilledButton(
              onPressed: busy ? null : save,
              child: Text(busy ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      );
}

class ProfilePage extends StatefulWidget {
  final bool provider;
  const ProfilePage({super.key, required this.provider});
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  Map<String, dynamic>? profile;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/account/profile');
      if (mounted) setState(() => profile = Map<String, dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> verify() async {
    setState(() => busy = true);
    try {
      final result = await api.call(
        '/auth/send-phone-otp',
        method: 'POST',
        body: {'phone': profile!['phone']},
      );
      if (!mounted) return;
      final code = TextEditingController();
      final otp = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Verify phone'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (result['developmentOtp'] != null)
                Text('Development code: ${result['developmentOtp']}'),
              input(code, 'OTP'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, code.text),
              child: const Text('Verify'),
            ),
          ],
        ),
      );
      code.dispose();
      if (otp != null) {
        await api.call(
          '/auth/verify-phone-otp',
          method: 'POST',
          body: {'phone': profile!['phone'], 'otp': otp},
        );
        await load();
      }
    } catch (e) {
      if (mounted) await message(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Profile & addresses')),
        body: profile == null
            ? Center(child: Text(error ?? 'Loading…'))
            : ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Text(
                    '${profile!['name']}\n${profile!['email']}\n${profile!['phone']}',
                  ),
                  const SizedBox(height: 12),
                  Text(
                    profile!['phoneVerifiedAt'] == null
                        ? 'Phone not verified'
                        : 'Phone verified',
                  ),
                  if (profile!['phoneVerifiedAt'] == null)
                    FilledButton(
                      onPressed: busy ? null : verify,
                      child: const Text('Verify phone'),
                    ),
                  TextButton(
                    onPressed: () async {
                      await push(
                        c,
                        FormPage(
                          title: 'Edit name',
                          path: '/account/profile',
                          method: 'PUT',
                          fields: {'Name': profile!['name']},
                          body: (v) => {'name': v['Name']},
                        ),
                      );
                      await load();
                    },
                    child: const Text('Edit name'),
                  ),
                  if (!widget.provider) ...[
                    const Divider(),
                    const Text('Saved addresses'),
                    for (final a
                        in profile!['customerProfile']?['addresses'] ?? [])
                      ListTile(
                        title: Text('${a['label']}: ${a['line1']}'),
                        subtitle: Text('${a['city']}, ${a['postalCode']}'),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline),
                          onPressed: () async {
                            try {
                              await api.call(
                                '/account/addresses/${a['id']}',
                                method: 'DELETE',
                              );
                              await load();
                            } catch (e) {
                              if (c.mounted) await message(c, '$e');
                            }
                          },
                        ),
                      ),
                    FilledButton(
                      onPressed: () async {
                        await push(
                          c,
                          FormPage(
                            title: 'Add address',
                            path: '/account/addresses',
                            fields: const {
                              'Label': 'Home',
                              'Address': '',
                              'City': '',
                              'State': '',
                              'Postal code': '',
                              'Latitude': '',
                              'Longitude': '',
                            },
                            body: (v) => {
                              'label': v['Label'],
                              'line1': v['Address'],
                              'city': v['City'],
                              'state': v['State'],
                              'postalCode': v['Postal code'],
                              'latitude': double.parse(v['Latitude']!),
                              'longitude': double.parse(v['Longitude']!),
                            },
                          ),
                        );
                        await load();
                      },
                      child: const Text('Add address'),
                    ),
                  ],
                ],
              ),
      );
}

class SearchPage extends StatefulWidget {
  const SearchPage({super.key});
  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final lat = TextEditingController(),
      lon = TextEditingController(),
      radius = TextEditingController(text: '50');
  List<dynamic> categories = [], results = [];
  String? service, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/categories');
      if (mounted) setState(() => categories = List<dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  void dispose() {
    lat.dispose();
    lon.dispose();
    radius.dispose();
    super.dispose();
  }

  Future<void> search() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final q = Uri(
        queryParameters: {
          'latitude': double.parse(lat.text).toString(),
          'longitude': double.parse(lon.text).toString(),
          'distanceKm': double.parse(radius.text).toString(),
          if (service != null) 'serviceId': service!,
        },
      ).query;
      final d = await api.call('/search/providers?$q');
      if (mounted) setState(() => results = List<dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Find a professional')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            DropdownButtonFormField<String>(
              value: service,
              decoration: const InputDecoration(labelText: 'Service'),
              items: [
                for (final cat in categories)
                  for (final s in cat['services'] ?? [])
                    DropdownMenuItem(
                      value: s['id'] as String,
                      child: Text('${cat['name']} • ${s['name']}'),
                    ),
              ],
              onChanged: (v) => setState(() => service = v),
            ),
            const SizedBox(height: 14),
            input(lat, 'Service address latitude', number: true),
            input(lon, 'Service address longitude', number: true),
            input(radius, 'Search radius (km)', number: true),
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
            FilledButton(
              onPressed: busy ? null : search,
              child: const Text('Search providers'),
            ),
            for (final p in results)
              Card(
                child: ListTile(
                  title: Text('${p['user']['name']} • ${p['title'] ?? ''}'),
                  subtitle: Text(
                    '${p['distanceKm']} km • Trust ${p['trustScore']?['score'] ?? 50}\n${(p['reasons'] as List).join(', ')}',
                  ),
                  onTap: () => push(
                    c,
                    ProviderDetails(
                      provider: Map<String, dynamic>.from(p),
                      latitude: lat.text,
                      longitude: lon.text,
                      serviceId: service,
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}

class ProviderDetails extends StatelessWidget {
  final Map<String, dynamic> provider;
  final String latitude, longitude;
  final String? serviceId;
  const ProviderDetails({
    super.key,
    required this.provider,
    required this.latitude,
    required this.longitude,
    this.serviceId,
  });
  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: Text(provider['user']['name'])),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              provider['title'] ?? '',
              style: Theme.of(c).textTheme.headlineSmall,
            ),
            Text(provider['description'] ?? ''),
            Text(
              'Experience: ${provider['experienceYears']} years\nLanguages: ${(provider['languages'] as List).join(', ')}\nCity: ${provider['city']}',
            ),
            Wrap(
              children: [
                for (final b in provider['badges'])
                  Chip(label: Text(label(b['type']))),
              ],
            ),
            const Text('Working hours (Asia/Kolkata; weekday 0 = Sunday)'),
            for (final a in provider['availability'])
              Text('Day ${a['weekday']}: ${a['startTime']}–${a['endTime']}'),
            for (final s in provider['services'])
              Card(
                child: ListTile(
                  title: Text(s['service']['name']),
                  subtitle: Text('Starting price ₹${s['startingPrice']}'),
                  trailing: FilledButton(
                    onPressed: () => push(
                      c,
                      CreateBooking(
                        providerId: provider['id'],
                        serviceId: s['serviceId'],
                        latitude: latitude,
                        longitude: longitude,
                      ),
                    ),
                    child: const Text('Book'),
                  ),
                ),
              ),
            TextButton(
              onPressed: () => push(
                c,
                DataPage(
                  title: 'Provider reviews & details',
                  path: '/search/providers/${provider['id']}',
                ),
              ),
              child: const Text('Read reviews'),
            ),
          ],
        ),
      );
}

class CreateBooking extends StatefulWidget {
  final String providerId, serviceId, latitude, longitude;
  const CreateBooking({
    super.key,
    required this.providerId,
    required this.serviceId,
    required this.latitude,
    required this.longitude,
  });
  @override
  State<CreateBooking> createState() => _CreateBookingState();
}

class _CreateBookingState extends State<CreateBooking> {
  final address = TextEditingController(),
      problem = TextEditingController(),
      notes = TextEditingController();
  DateTime? when;
  String? savedLatitude, savedLongitude;
  bool busy = false;
  String? error;
  @override
  void dispose() {
    address.dispose();
    problem.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> chooseAddress() async {
    try {
      final profile = await api.call('/account/profile');
      final rows = profile['customerProfile']?['addresses'] as List? ?? [];
      if (!mounted) return;
      if (rows.isEmpty) {
        await message(context, 'Add an address in Profile & addresses first.');
        return;
      }
      final selected = await showDialog<Map<String, dynamic>>(
          context: context,
          builder: (c) => SimpleDialog(
                  title: const Text('Choose a saved address'),
                  children: [
                    for (final a in rows)
                      SimpleDialogOption(
                          onPressed: () =>
                              Navigator.pop(c, Map<String, dynamic>.from(a)),
                          child: Text(
                              '${a['label']}: ${a['line1']}, ${a['city']}'))
                  ]));
      if (selected != null && mounted) {
        setState(() {
          address.text =
              '${selected['line1']}, ${selected['city']}, ${selected['state']} ${selected['postalCode']}';
          savedLatitude = selected['latitude'].toString();
          savedLongitude = selected['longitude'].toString();
        });
      }
    } catch (e) {
      if (mounted) await message(context, '$e');
    }
  }

  Future<void> selectTime() async {
    final now = DateTime.now();
    final day = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 180)),
      initialDate: now.add(const Duration(days: 1)),
    );
    if (day == null || !mounted) return;
    final t = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 10, minute: 0),
    );
    if (t != null && mounted) {
      setState(
        () => when = DateTime(day.year, day.month, day.day, t.hour, t.minute),
      );
    }
  }

  Future<void> book() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (when == null) throw Exception('Choose appointment date and time');
      await api.call(
        '/bookings',
        method: 'POST',
        body: {
          'providerId': widget.providerId,
          'serviceId': widget.serviceId,
          'addressText': address.text.trim(),
          'problemDescription': problem.text.trim(),
          'additionalInstructions': notes.text.trim(),
          'latitude': double.parse(savedLatitude ?? widget.latitude),
          'longitude': double.parse(savedLongitude ?? widget.longitude),
          'preferredAt': when!.toUtc().toIso8601String(),
        },
      );
      if (mounted) {
        await message(
          context,
          'Booking requested. Follow its progress in My bookings.',
        );
        if (mounted) Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Request service')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            input(address, 'Full service address'),
            TextButton(
                onPressed: chooseAddress,
                child: const Text('Use a saved address')),
            input(problem, 'Describe the problem'),
            input(notes, 'Additional instructions'),
            Text(
              'Appointment uses your device timezone. Provider working hours are shown in Asia/Kolkata.',
            ),
            TextButton(
              onPressed: selectTime,
              child:
                  Text(when == null ? 'Choose date & time' : when.toString()),
            ),
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
            FilledButton(
              onPressed: busy ? null : book,
              child: const Text('Send booking request'),
            ),
          ],
        ),
      );
}

class BookingsPage extends StatefulWidget {
  final bool provider;
  const BookingsPage({super.key, required this.provider});
  @override
  State<BookingsPage> createState() => _BookingsPageState();
}

class _BookingsPageState extends State<BookingsPage> {
  List<dynamic>? rows;
  String? error;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 15), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/bookings');
      if (mounted) {
        setState(() {
          rows = List<dynamic>.from(d);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(
          title: const Text('My bookings'),
          actions: [
            IconButton(onPressed: load, icon: const Icon(Icons.refresh))
          ],
        ),
        body: error != null
            ? Center(child: Text(error!))
            : rows == null
                ? const Center(child: CircularProgressIndicator())
                : rows!.isEmpty
                    ? const Center(child: Text('No bookings yet.'))
                    : ListView(
                        children: [
                          for (final b in rows!)
                            Card(
                              child: ListTile(
                                title: Text(b['service']['name']),
                                subtitle: Text(
                                  '${label(b['status'])}\n${DateTime.parse(b['preferredAt']).toLocal()}',
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () async {
                                  await push(
                                    c,
                                    BookingDetails(
                                        id: b['id'], provider: widget.provider),
                                  );
                                  await load();
                                },
                              ),
                            ),
                        ],
                      ),
      );
}

class BookingDetails extends StatefulWidget {
  final String id;
  final bool provider;
  const BookingDetails({super.key, required this.id, required this.provider});
  @override
  State<BookingDetails> createState() => _BookingDetailsState();
}

class _BookingDetailsState extends State<BookingDetails> {
  Map<String, dynamic>? b;
  String? error;
  bool busy = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (!busy) load();
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/bookings/${widget.id}');
      if (mounted) {
        setState(() {
          b = Map<String, dynamic>.from(d);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<String?> ask(String title) async {
    final field = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: input(field, title),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, field.text.trim()),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    field.dispose();
    return text;
  }

  Future<void> change(String status) async {
    setState(() => busy = true);
    try {
      final body = <String, dynamic>{'status': status};
      if (status == 'IN_PROGRESS') {
        final otp = await ask('Customer start OTP');
        if (otp == null) return;
        body['otp'] = otp;
      }
      if (status == 'AWAITING_CUSTOMER_CONFIRMATION') {
        final amount = await ask('Final amount (₹)');
        if (amount == null) return;
        body['finalAmount'] = double.parse(amount);
      }
      await api.call(
        '/bookings/${widget.id}/transition',
        method: 'POST',
        body: body,
      );
      await load();
    } catch (e) {
      if (mounted) await message(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) {
    final status = b?['status'] as String?;
    final actions = <String, String>{
      if (widget.provider && status == 'PENDING') 'ACCEPTED': 'Accept request',
      if (widget.provider && status == 'PENDING') 'REJECTED': 'Reject request',
      if (!widget.provider && status == 'ACCEPTED')
        'CONFIRMED': 'Confirm booking',
      if (widget.provider && status == 'CONFIRMED')
        'PROVIDER_ON_THE_WAY': 'I am on the way',
      if (widget.provider && status == 'PROVIDER_ON_THE_WAY')
        'IN_PROGRESS': 'Enter OTP & start job',
      if (widget.provider && status == 'IN_PROGRESS')
        'AWAITING_CUSTOMER_CONFIRMATION': 'Submit final amount & finish',
      if (!widget.provider && status == 'AWAITING_CUSTOMER_CONFIRMATION')
        'COMPLETED': 'Confirm work completed',
      if (!widget.provider && ['PENDING', 'CONFIRMED'].contains(status))
        'CANCELLED_BY_CUSTOMER': 'Cancel booking',
      if (widget.provider && ['ACCEPTED', 'CONFIRMED'].contains(status))
        'CANCELLED_BY_PROVIDER': 'Cancel booking',
      if (!widget.provider && status == 'PROVIDER_ON_THE_WAY')
        'NO_SHOW': 'Report provider no-show',
      if ((!widget.provider &&
              [
                'IN_PROGRESS',
                'AWAITING_CUSTOMER_CONFIRMATION',
                'COMPLETED',
              ].contains(status)) ||
          (widget.provider && status == 'IN_PROGRESS'))
        'DISPUTED': 'Dispute this job',
    };
    return Scaffold(
      appBar: AppBar(
        title: const Text('Booking details'),
        actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh))],
      ),
      body: b == null
          ? Center(child: Text(error ?? 'Loading…'))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  label(status!),
                  style: Theme.of(c).textTheme.headlineSmall,
                ),
                SelectableText('Booking: ${widget.id}'),
                Text(
                  '${b!['problemDescription']}\n${b!['addressText']}\nAppointment: ${DateTime.parse(b!['preferredAt']).toLocal()}\nCustomer: ${b!['customer']['user']['name']}\nProvider: ${b!['provider']['user']['name']}',
                ),
                if (b!['finalAmount'] != null)
                  Text('Final amount: ₹${b!['finalAmount']}'),
                if (error != null) Text(error!),
                for (final a in actions.entries)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: FilledButton(
                      onPressed: busy ? null : () => change(a.key),
                      child: Text(a.value),
                    ),
                  ),
                if (!widget.provider && status == 'PROVIDER_ON_THE_WAY')
                  TextButton(
                    onPressed: busy
                        ? null
                        : () async {
                            try {
                              final r = await api.call(
                                '/bookings/${widget.id}/start-otp',
                                method: 'POST',
                              );
                              if (c.mounted) {
                                await message(
                                  c,
                                  'Share only when the provider arrives.\nStart OTP: ${r['otp'] ?? r['developmentOtp'] ?? 'Check your messages'}\nValid for 10 minutes.',
                                );
                              }
                            } catch (e) {
                              if (c.mounted) await message(c, '$e');
                            }
                          },
                    child: const Text('Generate job-start OTP'),
                  ),
                if ([
                  'CONFIRMED',
                  'PROVIDER_ON_THE_WAY',
                  'IN_PROGRESS',
                  'AWAITING_CUSTOMER_CONFIRMATION',
                  'COMPLETED',
                  'REVIEWED',
                ].contains(status))
                  TextButton(
                    onPressed: () => push(c, ChatPage(bookingId: widget.id)),
                    child: const Text('Open booking chat'),
                  ),
                if (!widget.provider && status == 'COMPLETED')
                  TextButton(
                    onPressed: () async {
                      await push(
                        c,
                        FormPage(
                          title: 'Review service',
                          path: '/reviews',
                          fields: const {'Rating (1–5)': '5', 'Review': ''},
                          body: (v) => {
                            'bookingId': widget.id,
                            'rating': int.parse(v['Rating (1–5)']!),
                            'text': v['Review'],
                          },
                        ),
                      );
                      await load();
                    },
                    child: const Text('Leave a review'),
                  ),
                TextButton(
                  onPressed: () => push(
                    c,
                    FormPage(
                      title: 'Report a complaint',
                      path: '/account/complaints',
                      fields: const {'Reason (at least 10 characters)': ''},
                      body: (v) => {
                        'bookingId': widget.id,
                        'reason': v.values.first,
                      },
                    ),
                  ),
                  child: const Text('Submit complaint'),
                ),
                const Divider(),
                TextButton(
                    onPressed: () => push(
                        c,
                        BookingPhotosPage(
                            bookingId: widget.id,
                            canUpload: !widget.provider &&
                                ['PENDING', 'ACCEPTED', 'CONFIRMED']
                                    .contains(status))),
                    child: const Text('Problem photos')),
                const Text('Status history'),
                for (final h in b!['statusHistory'])
                  Text(
                    '${label(h['toStatus'])} • ${DateTime.parse(h['createdAt']).toLocal()}',
                  ),
                const SizedBox(height: 12),
                const Text(
                  'Payment is arranged directly with the provider. No online payment is processed by this app.',
                ),
              ],
            ),
    );
  }
}

class ChatPage extends StatefulWidget {
  final String bookingId;
  const ChatPage({super.key, required this.bookingId});
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final text = TextEditingController();
  List<dynamic> rows = [];
  String? error;
  bool sending = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 4), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    text.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/chat/${widget.bookingId}/messages');
      if (mounted) {
        setState(() {
          rows = List<dynamic>.from(d);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> send() async {
    if (text.text.trim().isEmpty) return;
    setState(() => sending = true);
    try {
      await api.call(
        '/chat/${widget.bookingId}/messages',
        method: 'POST',
        body: {'body': text.text.trim()},
      );
      text.clear();
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Booking chat')),
        body: Column(
          children: [
            if (error != null) Text(error!),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  for (final r in rows)
                    Card(
                      child: ListTile(
                        title: Text(r['body']),
                        subtitle: Text(
                          '${r['senderId']} • ${DateTime.parse(r['createdAt']).toLocal()}',
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: text,
                      maxLength: 2000,
                      decoration: const InputDecoration(labelText: 'Message'),
                    ),
                  ),
                  IconButton(
                    onPressed: sending ? null : send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class ProfessionalPage extends StatefulWidget {
  const ProfessionalPage({super.key});
  @override
  State<ProfessionalPage> createState() => _ProfessionalPageState();
}

class _ProfessionalPageState extends State<ProfessionalPage> {
  Map<String, dynamic>? p;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final r = await api.call('/providers/me');
      if (mounted) setState(() => p = Map<String, dynamic>.from(r));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext c) {
    if (p == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Professional profile')),
        body: Center(child: Text(error ?? 'Loading…')),
      );
    }
    return FormPage(
      title: 'Professional profile',
      path: '/providers/me',
      method: 'PUT',
      fields: {
        'Title': p!['title'] ?? '',
        'Description': p!['description'] ?? '',
        'Experience years': '${p!['experienceYears'] ?? 0}',
        'Languages (comma separated)': (p!['languages'] as List? ?? []).join(
          ', ',
        ),
        'City': p!['city'] ?? '',
        'Latitude': p!['latitude']?.toString() ?? '',
        'Longitude': p!['longitude']?.toString() ?? '',
        'Service radius km': '${p!['serviceRadiusKm'] ?? 15}',
      },
      body: (v) => {
        'title': v['Title'],
        'description': v['Description'],
        'experienceYears': int.parse(v['Experience years']!),
        'languages': v['Languages (comma separated)']!
            .split(',')
            .map((x) => x.trim())
            .where((x) => x.isNotEmpty)
            .toList(),
        'city': v['City'],
        'latitude': double.parse(v['Latitude']!),
        'longitude': double.parse(v['Longitude']!),
        'serviceRadiusKm': double.parse(v['Service radius km']!),
      },
    );
  }
}

class ServicesPage extends StatefulWidget {
  const ServicesPage({super.key});
  @override
  State<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends State<ServicesPage> {
  List<dynamic> cats = [], services = [];
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final c = await api.call('/categories'),
          p = await api.call('/providers/me');
      if (mounted) {
        setState(() {
          cats = List<dynamic>.from(c);
          services = List<dynamic>.from(p['services']);
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Services & pricing')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (error != null) Text(error!),
            for (final cat in cats) ...[
              Text(cat['name'], style: Theme.of(c).textTheme.titleLarge),
              for (final s in cat['services'])
                Builder(
                  builder: (c) {
                    final existing = services
                        .where((x) => x['serviceId'] == s['id'])
                        .firstOrNull;
                    return Card(
                      child: ListTile(
                        title: Text(s['name']),
                        subtitle: Text(
                          existing == null
                              ? 'Not offered'
                              : '₹${existing['startingPrice']} • ${existing['active'] ? 'Active' : 'Paused'}',
                        ),
                        onTap: () async {
                          await push(
                            c,
                            FormPage(
                              title: s['name'],
                              path: '/account/services/${s['id']}',
                              method: 'PUT',
                              fields: {
                                'Starting price':
                                    existing?['startingPrice']?.toString() ??
                                        '',
                                'Description': existing?['description'] ?? '',
                                'Active (true/false)':
                                    existing?['active']?.toString() ?? 'true',
                              },
                              body: (v) {
                                if (![
                                  'true',
                                  'false',
                                ].contains(v['Active (true/false)'])) {
                                  throw Exception(
                                      'Active must be true or false');
                                }
                                return {
                                  'startingPrice': double.parse(
                                    v['Starting price']!,
                                  ),
                                  'description': v['Description'],
                                  'active': v['Active (true/false)'] == 'true',
                                };
                              },
                            ),
                          );
                          await load();
                        },
                      ),
                    );
                  },
                ),
            ],
          ],
        ),
      );
}

class AvailabilityPage extends StatefulWidget {
  const AvailabilityPage({super.key});
  @override
  State<AvailabilityPage> createState() => _AvailabilityPageState();
}

class _AvailabilityPageState extends State<AvailabilityPage> {
  List<Map<String, dynamic>> days = List.generate(
    7,
    (i) => {
      'weekday': i,
      'startTime': '09:00',
      'endTime': '18:00',
      'enabled': false,
    },
  );
  bool paused = false, busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final p = await api.call('/providers/me');
      if (mounted) {
        setState(() {
          paused = p['listingPaused'];
          for (final a in p['availability']) {
            days[a['weekday']] = Map<String, dynamic>.from(a);
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> pick(int i, String key) async {
    final parts = (days[i][key] as String).split(':');
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(
        hour: int.parse(parts[0]),
        minute: int.parse(parts[1]),
      ),
    );
    if (t != null && mounted) {
      setState(
        () => days[i][key] =
            '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}',
      );
    }
  }

  Future<void> save() async {
    setState(() => busy = true);
    try {
      await api.call(
        '/account/availability',
        method: 'PUT',
        body: days
            .map(
              (d) => {
                'weekday': d['weekday'],
                'startTime': d['startTime'],
                'endTime': d['endTime'],
                'enabled': d['enabled'],
              },
            )
            .toList(),
      );
      await api.call(
        '/account/listing',
        method: 'PUT',
        body: {'listingPaused': paused},
      );
      if (mounted) await message(context, 'Availability saved.');
    } catch (e) {
      if (mounted) await message(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Availability & listing')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Working hours use Asia/Kolkata. Booking slots last one hour; overnight windows must be split across days.',
            ),
            if (error != null) Text(error!),
            SwitchListTile(
              title: const Text('Pause my listing'),
              value: paused,
              onChanged: (v) => setState(() => paused = v),
            ),
            for (var i = 0; i < 7; i++)
              Card(
                child: Column(
                  children: [
                    SwitchListTile(
                      title: Text(
                        [
                          'Sunday',
                          'Monday',
                          'Tuesday',
                          'Wednesday',
                          'Thursday',
                          'Friday',
                          'Saturday',
                        ][i],
                      ),
                      value: days[i]['enabled'],
                      onChanged: (v) => setState(() => days[i]['enabled'] = v),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        TextButton(
                          onPressed: () => pick(i, 'startTime'),
                          child: Text('From ${days[i]['startTime']}'),
                        ),
                        TextButton(
                          onPressed: () => pick(i, 'endTime'),
                          child: Text('Until ${days[i]['endTime']}'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            FilledButton(
              onPressed: busy ? null : save,
              child: const Text('Save availability'),
            ),
          ],
        ),
      );
}

class VerificationPage extends StatefulWidget {
  const VerificationPage({super.key});
  @override
  State<VerificationPage> createState() => _VerificationPageState();
}

class _VerificationPageState extends State<VerificationPage> {
  Map<String, dynamic>? p;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/account/profile');
      if (mounted) setState(() => p = Map<String, dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> identity() async {
    final consent = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Identity verification'),
        content: const Text(
          'This development build simulates DigiLocker consent. It does not verify a real government identity. Continue with development evidence for admin review?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('I consent'),
          ),
        ],
      ),
    );
    if (consent != true) return;
    if (mounted) setState(() => busy = true);
    try {
      final d = await api.call(
        '/verification/digilocker/start',
        method: 'POST',
        body: {'documentType': 'AADHAAR', 'consent': true},
      );
      await api.call(
        '/verification/digilocker/callback',
        method: 'POST',
        body: {
          'requestId': d['requestId'],
          'state': d['state'],
          'code': 'development-consent',
        },
      );
      await load();
    } catch (e) {
      if (mounted) await message(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> skill() async {
    setState(() => busy = true);
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg'],
        withData: true,
      );
      if (result == null) return;
      final f = result.files.single;
      if (f.bytes == null || f.size > 5000000) {
        throw Exception('Choose a PDF, PNG or JPEG smaller than 5 MB');
      }
      final ext = f.extension?.toLowerCase();
      await api.call(
        '/verification/skill',
        method: 'POST',
        body: {
          'documentType': 'OTHER',
          'mimeType': ext == 'pdf'
              ? 'application/pdf'
              : ext == 'png'
                  ? 'image/png'
                  : 'image/jpeg',
          'contentBase64': base64Encode(f.bytes!),
        },
      );
      await load();
    } catch (e) {
      if (mounted) await message(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Verification')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (error != null) Text(error!),
            const Text(
              'Identity and skill approvals are required before your listing appears in search. Development identity evidence requires manual admin review.',
            ),
            FilledButton(
              onPressed: busy ? null : identity,
              child: const Text('Submit identity consent'),
            ),
            FilledButton(
              onPressed: busy ? null : skill,
              child: const Text('Upload skill certificate'),
            ),
            for (final v in p?['providerProfile']?['verifications'] ?? [])
              Card(
                child: ListTile(
                  title:
                      Text('${v['verificationType']}: ${label(v['status'])}'),
                  subtitle: Text(v['rejectionReason'] ?? ''),
                ),
              ),
          ],
        ),
      );
}

class NotificationPage extends StatefulWidget {
  const NotificationPage({super.key});
  @override
  State<NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends State<NotificationPage> {
  List<dynamic> rows = [];
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/account/notifications');
      if (mounted) setState(() => rows = List<dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(
          title: const Text('Notifications'),
          actions: [
            IconButton(onPressed: load, icon: const Icon(Icons.refresh))
          ],
        ),
        body: ListView(
          children: [
            if (error != null) Text(error!),
            if (rows.isEmpty)
              const ListTile(title: Text('No notifications yet.')),
            for (final n in rows)
              ListTile(
                leading: Icon(
                  n['readAt'] == null ? Icons.mark_email_unread : Icons.drafts,
                ),
                title: Text(n['title']),
                subtitle: Text(n['body']),
                onTap: () async {
                  try {
                    await api.call(
                      '/account/notifications/${n['id']}/read',
                      method: 'POST',
                    );
                    await load();
                  } catch (e) {
                    if (c.mounted) await message(c, '$e');
                  }
                },
              ),
          ],
        ),
      );
}

class RecoveryPage extends StatefulWidget {
  const RecoveryPage({super.key});
  @override
  State<RecoveryPage> createState() => _RecoveryPageState();
}

class _RecoveryPageState extends State<RecoveryPage> {
  final email = TextEditingController(),
      token = TextEditingController(),
      password = TextEditingController();
  bool busy = false;
  @override
  void dispose() {
    email.dispose();
    token.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> request() async {
    setState(() => busy = true);
    try {
      final d = await api.call(
        '/auth/forgot-password',
        method: 'POST',
        body: {'email': email.text.trim()},
      );
      token.text = d['developmentToken'] ?? '';
      if (mounted) {
        await message(
          context,
          '${d['message']}${d['developmentToken'] != null ? '\nDevelopment recovery token filled below.' : ''}',
        );
      }
    } catch (e) {
      if (mounted) await message(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> reset() async {
    setState(() => busy = true);
    try {
      await api.call(
        '/auth/reset-password',
        method: 'POST',
        body: {'token': token.text.trim(), 'password': password.text},
      );
      if (mounted) {
        await message(
          context,
          'Password reset. Sign in with your new password.',
        );
        if (mounted) Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) await message(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Password recovery')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            input(email, 'Account email'),
            FilledButton(
              onPressed: busy ? null : request,
              child: const Text('Request recovery'),
            ),
            const SizedBox(height: 24),
            input(token, 'Recovery token'),
            input(password, 'New password', secret: true),
            FilledButton(
              onPressed: busy ? null : reset,
              child: const Text('Reset password'),
            ),
          ],
        ),
      );
}

class AdminPage extends StatefulWidget {
  const AdminPage({super.key});
  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage> {
  List<dynamic> rows = [];
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/admin/verifications');
      if (mounted) setState(() => rows = List<dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> evidence(dynamic v) async {
    try {
      final response = await http.get(
          Uri.parse(
              '${AppConfig.apiBaseUrl}/admin/verifications/${v['id']}/evidence'),
          headers: {
            'authorization': 'Bearer ${api.access}'
          }).timeout(const Duration(seconds: 20));
      if (response.statusCode != 200) {
        throw Exception('Evidence is unavailable or expired');
      }
      final bytes = Uint8List.fromList(response.bodyBytes);
      if (v['evidence']['mimeType'].toString().startsWith('image/')) {
        if (!mounted) return;
        await showDialog<void>(
            context: context,
            builder: (c) => AlertDialog(
                    title: const Text('Certificate evidence'),
                    content: Image.memory(bytes),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(c),
                          child: const Text('Close'))
                    ]));
      } else {
        await FilePicker.platform.saveFile(
            dialogTitle: 'Save certificate for review',
            fileName: 'certificate.pdf',
            bytes: bytes);
      }
    } catch (e) {
      if (mounted) await message(context, '$e');
    }
  }

  Future<void> decide(dynamic v, String status) async {
    try {
      await api.call(
        '/admin/verifications/${v['id']}/decision',
        method: 'POST',
        body: {
          'status': status,
          'reason': status == 'APPROVED'
              ? 'Reviewed by administrator'
              : 'Please resubmit valid evidence',
        },
      );
      await load();
    } catch (e) {
      if (mounted) await message(context, '$e');
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(
          title: const Text('Verification decisions'),
          actions: [
            IconButton(onPressed: load, icon: const Icon(Icons.refresh))
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (error != null) Text(error!),
            if (rows.isEmpty) const Text('No pending requests.'),
            for (final v in rows)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${v['provider']['user']['name']} • ${v['verificationType']}',
                      ),
                      SelectableText(
                        pretty({
                          'documentType': v['documentType'],
                          'source': v['source'],
                          'metadata': v['metadata'],
                          'evidence': v['evidence'],
                        }),
                      ),
                      if (v['evidence'] != null)
                        TextButton(
                            onPressed: () => evidence(v),
                            child: const Text('View or save certificate')),
                      Wrap(
                        spacing: 8,
                        children: [
                          FilledButton(
                            onPressed: () => decide(v, 'APPROVED'),
                            child: const Text('Approve'),
                          ),
                          TextButton(
                            onPressed: () => decide(v, 'RESUBMISSION_REQUIRED'),
                            child: const Text('Request resubmission'),
                          ),
                          TextButton(
                            onPressed: () => decide(v, 'REJECTED'),
                            child: const Text('Reject'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      );
}

class AdminComplaintsPage extends StatefulWidget {
  const AdminComplaintsPage({super.key});
  @override
  State<AdminComplaintsPage> createState() => _AdminComplaintsPageState();
}

class _AdminComplaintsPageState extends State<AdminComplaintsPage> {
  List<dynamic> rows = [];
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/admin/complaints');
      if (mounted) setState(() => rows = List<dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
        appBar: AppBar(title: const Text('Complaints & disputes')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (error != null) Text(error!),
            for (final r in rows)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(
                        '${r['reason']}\nStatus: ${r['status']}\n${r['resolution'] ?? ''}',
                      ),
                      TextButton(
                        onPressed: () async {
                          await push(
                            c,
                            FormPage(
                              title: 'Resolve complaint',
                              path: '/admin/complaints/${r['id']}/resolve',
                              fields: const {
                                'Status (UNDER_REVIEW/RESOLVED/REJECTED)':
                                    'RESOLVED',
                                'Resolution': '',
                              },
                              body: (v) => {
                                'status': v[
                                    'Status (UNDER_REVIEW/RESOLVED/REJECTED)'],
                                'resolution': v['Resolution'],
                              },
                            ),
                          );
                          await load();
                        },
                        child: const Text('Update complaint'),
                      ),
                      Wrap(
                        children: [
                          for (final status in [
                            'COMPLETED',
                            'CANCELLED_BY_PROVIDER',
                          ])
                            TextButton(
                              onPressed: () async {
                                try {
                                  await api.call(
                                    '/bookings/${r['bookingId']}/transition',
                                    method: 'POST',
                                    body: {'status': status},
                                  );
                                  if (c.mounted) {
                                    await message(
                                        c, 'Disputed booking updated.');
                                  }
                                } catch (e) {
                                  if (c.mounted) await message(c, '$e');
                                }
                              },
                              child: Text('Resolve booking: ${label(status)}'),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      );
}

class BookingPhotosPage extends StatefulWidget {
  final String bookingId;
  final bool canUpload;
  const BookingPhotosPage(
      {super.key, required this.bookingId, required this.canUpload});
  @override
  State<BookingPhotosPage> createState() => _BookingPhotosPageState();
}

class _BookingPhotosPageState extends State<BookingPhotosPage> {
  List<dynamic> photos = [];
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await api.call('/bookings/${widget.bookingId}/photos');
      if (mounted) setState(() => photos = List<dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> upload() async {
    setState(() => busy = true);
    try {
      final result = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: ['png', 'jpg', 'jpeg'],
          withData: true);
      if (result == null) return;
      final f = result.files.single;
      if (f.bytes == null || f.size > 5000000) {
        throw Exception('Choose a PNG or JPEG below 5 MB');
      }
      await api
          .call('/bookings/${widget.bookingId}/photos', method: 'POST', body: {
        'mimeType':
            f.extension?.toLowerCase() == 'png' ? 'image/png' : 'image/jpeg',
        'contentBase64': base64Encode(f.bytes!)
      });
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> view(dynamic photo) async {
    try {
      final response = await http.get(
          Uri.parse(
              '${AppConfig.apiBaseUrl}/bookings/${widget.bookingId}/photos/${photo['id']}'),
          headers: {
            'authorization': 'Bearer ${api.access}'
          }).timeout(const Duration(seconds: 20));
      if (response.statusCode != 200) throw Exception('Photo unavailable');
      if (!mounted) return;
      await showDialog<void>(
          context: context,
          builder: (c) => AlertDialog(
                  content: Image.memory(response.bodyBytes),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c),
                        child: const Text('Close'))
                  ]));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
      appBar: AppBar(title: const Text('Problem photos')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text(
            'Photos are visible only to the customer and their booked provider. They are not sent to the AI service.'),
        if (error != null) Text(error!),
        if (widget.canUpload)
          FilledButton(
              onPressed: busy ? null : upload,
              child: const Text('Add a problem photo')),
        if (photos.isEmpty) const Text('No photos added.'),
        for (final p in photos)
          ListTile(
              leading: const Icon(Icons.photo),
              title: const Text('Problem photo'),
              subtitle: Text('${p['sizeBytes']} bytes'),
              onTap: () => view(p))
      ]));
}
