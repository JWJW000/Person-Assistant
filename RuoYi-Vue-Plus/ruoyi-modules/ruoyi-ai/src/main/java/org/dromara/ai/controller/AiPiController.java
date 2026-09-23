package org.dromara.ai.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.dromara.common.satoken.utils.LoginHelper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Authenticated, fixed-upstream proxy for the Pi gateway. */
@RestController
@RequestMapping("/ai/pi")
@RequiredArgsConstructor
public class AiPiController {

    private final HttpClient piHttpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    @Value("${pi.gateway-url:}")
    private String gatewayUrl;

    @Value("${pi.internal-token:}")
    private String internalToken;

    @RequestMapping("/**")
    public ResponseEntity<StreamingResponseBody> proxy(HttpServletRequest request) throws Exception {
        if (gatewayUrl.isBlank() || internalToken.isBlank()) {
            return ResponseEntity.status(503).body(output -> output.write("Pi gateway is not configured".getBytes()));
        }

        String applicationPath = request.getRequestURI().substring(request.getContextPath().length());
        if (!applicationPath.startsWith("/ai/pi")) {
            return ResponseEntity.notFound().build();
        }
        String suffix = applicationPath.substring("/ai/pi".length());
        String query = request.getQueryString();
        URI target = URI.create(gatewayUrl.replaceAll("/+$", "") + "/internal/pi" + suffix + (query == null ? "" : "?" + query));
        byte[] body = request.getInputStream().readAllBytes();
        HttpRequest.BodyPublisher publisher = body.length == 0
            ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofByteArray(body);
        String userId = LoginHelper.getUserIdStr();
        if (userId == null || userId.isBlank()) {
            return ResponseEntity.status(401).build();
        }
        HttpRequest.Builder upstream = HttpRequest.newBuilder(target)
            .timeout(Duration.ofSeconds(30))
            .header("Authorization", "Bearer " + internalToken)
            .header("X-Pi-User-Id", userId)
            .header("X-Pi-Tenant-Id", "default")
            .method(request.getMethod(), publisher);
        String contentType = request.getContentType();
        if (contentType != null) {
            upstream.header(HttpHeaders.CONTENT_TYPE, contentType);
        }

        HttpResponse<java.io.InputStream> response = piHttpClient.send(upstream.build(), HttpResponse.BodyHandlers.ofInputStream());
        HttpHeaders headers = new HttpHeaders();
        response.headers().firstValue(HttpHeaders.CONTENT_TYPE).ifPresent(value -> headers.set(HttpHeaders.CONTENT_TYPE, value));
        headers.set(HttpHeaders.CACHE_CONTROL, "no-cache, no-transform");
        headers.set("X-Accel-Buffering", "no");
        StreamingResponseBody stream = output -> {
            try (var input = response.body()) {
                byte[] buffer = new byte[8192];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    output.write(buffer, 0, length);
                    output.flush();
                }
            }
        };
        return new ResponseEntity<>(stream, headers, HttpStatusCode.valueOf(response.statusCode()));
    }
}
