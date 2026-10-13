package com.um.uy.oficiosya.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** A text message carries its content; a job card carries the job and no content. */
class ChatMessageTest {

    private final JobRequest job = JobRequest.builder().id(87L).build();

    @Test
    void aTextMessageNeedsContent() {
        assertTrue(ChatMessage.builder().type(ChatMessageType.TEXT).content("Hola").build().isConsistentWithType());
        assertTrue(ChatMessage.builder().type(ChatMessageType.TEXT).content("Hola").jobRequest(job).build()
                .isConsistentWithType());
        assertFalse(ChatMessage.builder().type(ChatMessageType.TEXT).build().isConsistentWithType());
    }

    @Test
    void aJobProposalNeedsTheJobAndNoContent() {
        assertTrue(ChatMessage.builder().type(ChatMessageType.JOB_PROPOSAL).jobRequest(job).build()
                .isConsistentWithType());
        assertFalse(ChatMessage.builder().type(ChatMessageType.JOB_PROPOSAL).build().isConsistentWithType());
        assertFalse(ChatMessage.builder().type(ChatMessageType.JOB_PROPOSAL).jobRequest(job).content("Hola").build()
                .isConsistentWithType());
    }
}
