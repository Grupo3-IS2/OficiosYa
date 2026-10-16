package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.service.interfaces.ChatService;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ChatJobListenerTest {

    @Test
    void aProposedJob_leavesItsCardInTheChat() {
        ChatService chatService = mock(ChatService.class);

        new ChatJobListener(chatService).onJobProposed(new JobRequestEvents.JobProposed(5L));

        verify(chatService).addJobProposal(5L);
    }
}
