package in.deepraj.ai.chatbot.controller;

import in.deepraj.ai.chatbot.controller.ChatController.ChatRequest;
import in.deepraj.ai.chatbot.controller.ChatController.ChatTurn;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatControllerTest {

    @Test
    void mapsRolesInOrder() {
        List<Message> messages = ChatController.toMessages(new ChatRequest(List.of(
                new ChatTurn("user", "My name is Deep."),
                new ChatTurn("assistant", "Nice to meet you, Deep!"),
                new ChatTurn("USER", "What is my name?"))));

        assertThat(messages).hasSize(3);
        assertThat(messages.get(0)).isInstanceOf(UserMessage.class);
        assertThat(messages.get(1)).isInstanceOf(AssistantMessage.class);
        assertThat(messages.get(2)).isInstanceOf(UserMessage.class);
        assertThat(messages.get(2).getContent()).isEqualTo("What is my name?");
    }

    @Test
    void keepsOnlyTheMostRecentMessages() {
        List<ChatTurn> turns = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            turns.add(new ChatTurn(i % 2 == 0 ? "user" : "assistant", "message " + i));
        }
        turns.add(new ChatTurn("user", "latest"));

        List<Message> messages = ChatController.toMessages(new ChatRequest(turns));

        assertThat(messages).hasSize(ChatController.MAX_HISTORY_MESSAGES);
        assertThat(messages.get(messages.size() - 1).getContent()).isEqualTo("latest");
    }

    @Test
    void extractsGroqErrorMessage() {
        String groq404 = "{\"error\":{\"message\":\"The model `groq/compound` does not exist or you do not have access to it.\","
                + "\"type\":\"invalid_request_error\",\"code\":\"model_not_found\"}}";
        assertThat(ChatController.upstreamMessage(groq404)).contains("does not exist");
        assertThat(ChatController.upstreamMessage("")).isNull();
        assertThat(ChatController.upstreamMessage("<html>oops</html>")).isNull();
        assertThat(ChatController.upstreamMessage("{\"error\":{}}")).isNull();
    }

    @Test
    void rejectsInvalidRequests() {
        assertThatThrownBy(() -> ChatController.toMessages(new ChatRequest(List.of())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ChatController.toMessages(new ChatRequest(null)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ChatController.toMessages(new ChatRequest(List.of(new ChatTurn("system", "hi")))))
                .hasMessageContaining("role");
        assertThatThrownBy(() -> ChatController.toMessages(new ChatRequest(List.of(new ChatTurn("user", "  ")))))
                .hasMessageContaining("content");
        assertThatThrownBy(() -> ChatController.toMessages(new ChatRequest(List.of(
                new ChatTurn("user", "hi"), new ChatTurn("assistant", "hello")))))
                .hasMessageContaining("last message");
        assertThatThrownBy(() -> ChatController.toMessages(new ChatRequest(List.of(
                new ChatTurn("user", "x".repeat(ChatController.MAX_MESSAGE_CHARS + 1))))))
                .hasMessageContaining("longer than");
    }
}
