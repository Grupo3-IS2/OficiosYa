package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.repository.ChatMessageRepository;
import com.um.uy.oficiosya.repository.ConversationRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class ChatMessageCleanupTest {

    private static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");

    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ConversationRepository conversations = mock(ConversationRepository.class);

    private ChatMessageCleanup cleanup(long retentionDays) {
        return new ChatMessageCleanup(messages, conversations, Clock.fixed(NOW, ZoneOffset.UTC), retentionDays);
    }

    @Test
    void deletesWhatIsOlderThanTheRetention_andClearsTheConversationsLeftEmpty() {
        cleanup(30).purgeOld();

        verify(messages).deleteOlderThan(NOW.atOffset(ZoneOffset.UTC).minusDays(30));
        verify(conversations).clearEmptied();
    }

    @Test
    void aNegativeRetention_keepsEverything() {
        cleanup(-1).purgeOld();

        verifyNoInteractions(messages, conversations);
    }

    @Test
    void zeroDays_deletesUpToNow() {
        cleanup(0).purgeOld();

        verify(messages).deleteOlderThan(any());
    }
}
