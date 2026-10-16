package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.response.ChatMessageResponse;

import java.util.Set;
import java.util.UUID;

/** A chat message was stored; once committed it's pushed to both participants (all their tabs). */
public record ChatMessageSent(ChatMessageResponse message, Set<UUID> recipientIds) {
}
