import io
import json
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'clients' / 'python'))
from payload_coordination import AuthenticatedCoordinationClient, CoordinationClientError


class Response(io.BytesIO):
    status = 200


class AuthenticatedClientTests(unittest.TestCase):
    def test_late_eof_cannot_report_success(self):
        response = Response(b'{"protocol":"payload.terminal.v1","result":{}}')
        client = AuthenticatedCoordinationClient('https://example.com', 'a' * 48, 'board-one', opener=lambda *a, **k: response, timeout=10)
        with patch('payload_coordination.time.monotonic', side_effect=[0, 1, 2, 3, 11]):
            with self.assertRaises(CoordinationClientError) as caught: client.identity()
        self.assertEqual(caught.exception.code, 'TIMEOUT')
        self.assertTrue(response.closed)

    def test_exact_terminal_envelope_and_identity_free_ack(self):
        calls = []
        def send(request, **kwargs):
            calls.append(request)
            return Response(b'{"protocol":"payload.terminal.v1","result":{"accepted":true}}')
        client = AuthenticatedCoordinationClient('http://127.0.0.1:3000', 'a' * 48, 'board-one', opener=send)
        self.assertTrue(client.identity()['accepted'])
        client.acknowledge('MSG-one', 'sha256:' + 'b' * 64)
        body = json.loads(calls[-1].data)
        self.assertEqual(calls[-1].full_url, 'http://127.0.0.1:3000/api/v1/terminal')
        self.assertEqual(calls[-1].get_header('Authorization'), 'Bearer ' + 'a' * 48)
        self.assertEqual(body, {'command': 'coordination', 'request': {'operation': 'acknowledge', 'boardId': 'board-one', 'messageId': 'MSG-one', 'expectedDigest': 'sha256:' + 'b' * 64}})
        client.forget()
        with self.assertRaisesRegex(ValueError, 'AUTHENTICATION_REQUIRED'): client.identity()
        self.assertEqual(len(calls), 2)

    def test_invalid_origin_and_oversized_reply_refuse(self):
        for origin in ['http://example.com', 'https://user:password@example.com', 'https://example.com/path']:
            with self.assertRaises(ValueError): AuthenticatedCoordinationClient(origin, 'a' * 48, 'board-one')
        client = AuthenticatedCoordinationClient('https://example.com', 'a' * 48, 'board-one', opener=lambda *args, **kwargs: Response(b'x' * 1100001))
        with self.assertRaisesRegex(ValueError, 'TERMINAL_RESPONSE_LIMIT'): client.identity()

    def test_no_retry_and_fixed_error_message(self):
        replies = []
        def refused(*args, **kwargs):
            response = Response(b'{"error":"COORDINATION_MEMBERSHIP_REQUIRED"}')
            response.status = 403
            replies.append(response)
            return response
        client = AuthenticatedCoordinationClient('https://example.com', 'a' * 48, 'board-one', opener=refused)
        with self.assertRaises(CoordinationClientError) as caught: client.identity()
        self.assertEqual(caught.exception.code, 'COORDINATION_MEMBERSHIP_REQUIRED')
        self.assertTrue(replies[0].closed)
        self.assertEqual(len(replies), 1)


if __name__ == '__main__': unittest.main()
