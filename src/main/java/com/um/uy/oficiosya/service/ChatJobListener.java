package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.service.interfaces.ChatService;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Leaves each new job's "Trabajo propuesto" card in the pair's chat. Synchronous, inside the job's own
 * transaction: there is never a job without its card nor a card without its job.
 */
@Component
public class ChatJobListener {

    private final ChatService chatService;

    public ChatJobListener(ChatService chatService) {
        this.chatService = chatService;
    }

    @EventListener
    public void onJobProposed(JobRequestEvents.JobProposed event) {
        chatService.addJobProposal(event.jobRequestId());
    }
}
