package com.um.uy.oficiosya.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReviewResponse {
    private Long jobRequestId;
    private String clientName;
    private String clientProfileImageUrl;
    private UUID professionalId;
    private String professionalName;
    private Integer rating;
    private String review;
}
