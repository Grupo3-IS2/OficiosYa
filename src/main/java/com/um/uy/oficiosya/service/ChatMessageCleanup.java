package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.repository.ChatMessageRepository;
import com.um.uy.oficiosya.repository.ConversationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;

/** Deletes chat messages older than {@code CHAT_MESSAGE_RETENTION_DAYS}, once a day; -1 keeps them all. */
@Component
@Slf4j
public class ChatMessageCleanup {

    private final ChatMessageRepository chatMessageRepository;
    private final ConversationRepository conversationRepository;
    private final Clock clock;
    private final long retentionDays;

    public ChatMessageCleanup(ChatMessageRepository chatMessageRepository,
                              ConversationRepository conversationRepository,
                              Clock clock,
                              @Value("${app.chat.message-retention-days}") long retentionDays) {
        this.chatMessageRepository = chatMessageRepository;
        this.conversationRepository = conversationRepository;
        this.clock = clock;
        this.retentionDays = retentionDays;
    }

    @Scheduled(fixedDelayString = "PT24H", initialDelayString = "PT10M")
    @Transactional
    public void purgeOld() {
        if (retentionDays < 0) {
            return;
        }

        int deleted = chatMessageRepository.deleteOlderThan(OffsetDateTime.now(clock).minusDays(retentionDays));
        // A conversation that still has messages keeps its preview: only older ones than its last were deleted
        int emptied = conversationRepository.clearEmptied();
        log.info("{} old chat messages deleted, {} conversations left empty", deleted, emptied);
    }
}
