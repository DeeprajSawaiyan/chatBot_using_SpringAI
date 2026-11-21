package in.deepraj.ai.chatbot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SpringBootChatBotApplication {

	public static void main(String[] args) {
		// Spring AI refuses to start with a blank key; use a placeholder so the app boots and ChatController can return a clear 503.
		String key = System.getenv("GROQ_API_KEY");
		if (key == null || key.isBlank()) {
			System.setProperty("spring.ai.openai.api-key", "not-set");
		}
		SpringApplication.run(SpringBootChatBotApplication.class, args);
	}

}
