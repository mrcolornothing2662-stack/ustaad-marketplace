import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../config/app_config.dart';
import '../storage/token_storage.dart';

class ApiClient {
  final TokenStorage tokens;
  ApiClient(this.tokens);
  Future<dynamic> request(String path,
      {String method = 'GET', Map<String, dynamic>? body}) async {
    final token = await tokens.read();
    final response =
        http.Request(method, Uri.parse('${AppConfig.apiBaseUrl}$path'))
          ..headers.addAll({
            'content-type': 'application/json',
            if (token != null) 'authorization': 'Bearer $token'
          })
          ..body = body == null ? '' : jsonEncode(body);
    final streamed = await response.send();
    final text = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 400) throw Exception(text);
    return text.isEmpty ? null : jsonDecode(text);
  }
}
