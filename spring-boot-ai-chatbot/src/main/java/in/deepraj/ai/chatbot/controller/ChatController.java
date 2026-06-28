package in.deepraj.ai.chatbot.controller;

import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import reactor.core.publisher.Flux;

import java.nio.charset.StandardCharsets;

@RestController
public class ChatController {

    private final OpenAiChatModel chatModel;

    @Value("${groq.api.key:}")
    private String groqApiKey;

    @Autowired
    public ChatController(OpenAiChatModel chatModel) {
        this.chatModel = chatModel;
    }

    @GetMapping("/ai/chat")
    public Flux<ChatResponse> generateStream(@RequestParam(value = "message", defaultValue = "Tell me a joke") String message) {
        Prompt prompt = new Prompt(new UserMessage(message));


        return chatModel.stream(prompt);
    }

    @GetMapping("/ai/chat/string")
    public ResponseEntity<String> generateString(@RequestParam(value = "message", defaultValue = "Tell me a joke") String message) {
        if (!StringUtils.hasText(groqApiKey)) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(
                    "GROQ_API_KEY is not set. Export GROQ_API_KEY (your Groq secret) and restart the Spring Boot app.");
        }
        try {
            Prompt prompt = new Prompt(new UserMessage(message));
            ChatResponse response = chatModel.call(prompt);
            String text = response.getResult().getOutput().getContent();
            return ResponseEntity.ok(text);
        } catch (Exception e) {
            String detail = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("Groq/API request failed: " + detail);
        }
    }

    @GetMapping(value = "/ai/chat/stream", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<StreamingResponseBody> streamString(
            @RequestParam(value = "message", defaultValue = "Tell me a joke") String message) {
        if (!StringUtils.hasText(groqApiKey)) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(outputStream -> outputStream.write(
                            "GROQ_API_KEY is not set. Export GROQ_API_KEY and restart the Spring Boot app."
                                    .getBytes(StandardCharsets.UTF_8)));
        }

        StreamingResponseBody body = outputStream -> {
            try {
                Prompt prompt = new Prompt(new UserMessage(message));
                Flux<ChatResponse> stream = chatModel.stream(prompt);
                for (ChatResponse response : stream.toIterable()) {
                    String content = response.getResult().getOutput().getContent();
                    if (content != null && !content.isEmpty()) {
                        outputStream.write(content.getBytes(StandardCharsets.UTF_8));
                        outputStream.flush();
                    }
                }
            } catch (Exception e) {
                String detail = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                outputStream.write(("Groq/API request failed: " + detail).getBytes(StandardCharsets.UTF_8));
            }
        };

        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_PLAIN)
                .header("Cache-Control", "no-cache")
                .body(body);
    }
}
