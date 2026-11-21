package in.deepraj.ai.chatbot.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.net.HttpRetryException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

@RestController
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String MISSING_KEY_MESSAGE =
            "GROQ_API_KEY is not set. Export GROQ_API_KEY (your Groq secret) and restart the Spring Boot app.";

    static final int MAX_HISTORY_MESSAGES = 20;
    static final int MAX_MESSAGE_CHARS = 20_000;

    private final OpenAiChatModel chatModel;

    @Value("${groq.api.key:}")
    private String groqApiKey;

    public ChatController(OpenAiChatModel chatModel) {
        this.chatModel = chatModel;
    }

    @GetMapping(value = "/ai/chat/string", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> generateString(
            @RequestParam(value = "message", defaultValue = "Tell me a joke") String message) {
        if (!StringUtils.hasText(groqApiKey)) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(MISSING_KEY_MESSAGE);
        }
        try {
            ChatResponse response = chatModel.call(new Prompt(new UserMessage(message)));
            return ResponseEntity.ok(response.getResult().getOutput().getContent());
        } catch (Exception e) {
            log.warn("Groq request failed", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("Groq/API request failed: " + describe(e));
        }
    }

    @GetMapping(value = "/ai/chat/stream", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<StreamingResponseBody> streamString(
            @RequestParam(value = "message", defaultValue = "Tell me a joke") String message) {
        return stream(new Prompt(new UserMessage(message)));
    }

    @PostMapping(value = "/ai/chat/stream",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<StreamingResponseBody> streamConversation(@RequestBody ChatRequest request) {
        List<Message> history;
        try {
            history = toMessages(request);
        } catch (IllegalArgumentException e) {
            return textResponse(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        return stream(new Prompt(history));
    }

    public record ChatTurn(String role, String content) {
    }

    public record ChatRequest(List<ChatTurn> messages) {
    }

    static List<Message> toMessages(ChatRequest request) {
        if (request == null || request.messages() == null || request.messages().isEmpty()) {
            throw new IllegalArgumentException("'messages' must contain at least one message.");
        }
        List<ChatTurn> turns = request.messages();
        List<ChatTurn> recent = turns.subList(Math.max(0, turns.size() - MAX_HISTORY_MESSAGES), turns.size());

        List<Message> messages = new ArrayList<>(recent.size());
        for (ChatTurn turn : recent) {
            if (turn == null || !StringUtils.hasText(turn.content())) {
                throw new IllegalArgumentException("Every message needs non-empty 'content'.");
            }
            if (turn.content().length() > MAX_MESSAGE_CHARS) {
                throw new IllegalArgumentException(
                        "A message is longer than " + MAX_MESSAGE_CHARS + " characters.");
            }
            String role = turn.role() == null ? "" : turn.role().trim().toLowerCase(Locale.ROOT);
            switch (role) {
                case "user" -> messages.add(new UserMessage(turn.content()));
                case "assistant" -> messages.add(new AssistantMessage(turn.content()));
                default -> throw new IllegalArgumentException(
                        "Message 'role' must be \"user\" or \"assistant\".");
            }
        }
        if (!(messages.get(messages.size() - 1) instanceof UserMessage)) {
            throw new IllegalArgumentException("The last message must have role \"user\".");
        }
        return messages;
    }

    private ResponseEntity<StreamingResponseBody> stream(Prompt prompt) {
        if (!StringUtils.hasText(groqApiKey)) {
            return textResponse(HttpStatus.SERVICE_UNAVAILABLE, MISSING_KEY_MESSAGE);
        }

        // Wait for the first chunk before committing the status, so upstream failures surface as a real 502.
        Iterator<ChatResponse> chunks;
        try {
            chunks = chatModel.stream(prompt).toIterable().iterator();
            chunks.hasNext();
        } catch (Exception e) {
            log.warn("Groq stream failed to start", e);
            return textResponse(HttpStatus.BAD_GATEWAY, "Groq/API request failed: " + describe(e));
        }

        StreamingResponseBody body = outputStream -> {
            try {
                while (chunks.hasNext()) {
                    String content = chunks.next().getResult().getOutput().getContent();
                    if (content != null && !content.isEmpty()) {
                        outputStream.write(content.getBytes(StandardCharsets.UTF_8));
                        outputStream.flush();
                    }
                }
            } catch (Exception e) {
                log.warn("Groq stream interrupted", e);
                outputStream.write(("\n\n_[Response interrupted: " + describe(e) + "]_")
                        .getBytes(StandardCharsets.UTF_8));
            }
        };

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_PLAIN)
                .header("Cache-Control", "no-cache")
                .body(body);
    }

    private static ResponseEntity<StreamingResponseBody> textResponse(HttpStatus status, String text) {
        return ResponseEntity.status(status)
                .contentType(MediaType.TEXT_PLAIN)
                .body(outputStream -> outputStream.write(text.getBytes(StandardCharsets.UTF_8)));
    }

    static String upstreamMessage(String body) {
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode message = JSON.readTree(body).path("error").path("message");
            return message.isTextual() && !message.asText().isBlank() ? message.asText() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String withUpstreamMessage(String status, String body) {
        String message = upstreamMessage(body);
        return message == null ? status : status + " — " + message;
    }

    private static String describe(Throwable e) {
        Throwable root = e;
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof RestClientResponseException r) {
                String status = r.getStatusText().isBlank() ? "HTTP " + r.getStatusCode().value() : r.getStatusCode().value() + " " + r.getStatusText();
                return withUpstreamMessage(status, r.getResponseBodyAsString());
            }
            if (t instanceof WebClientResponseException w) {
                return withUpstreamMessage(w.getStatusCode().value() + " " + w.getStatusText(), w.getResponseBodyAsString());
            }
            if (t instanceof HttpRetryException h) {
                HttpStatus status = HttpStatus.resolve(h.responseCode());
                return status != null ? status.value() + " " + status.getReasonPhrase() : "HTTP " + h.responseCode();
            }
            root = t;
        }
        return root.getMessage() != null ? root.getMessage() : root.getClass().getSimpleName();
    }
}
