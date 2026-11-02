import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  final _storage = const FlutterSecureStorage();
  Future<void> save(String token) =>
      _storage.write(key: 'access_token', value: token);
  Future<String?> read() => _storage.read(key: 'access_token');
  Future<void> clear() => _storage.deleteAll();
}
