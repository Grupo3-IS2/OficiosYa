package com.um.uy.oficiosya.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

/**
 * What anyone can see of a published professional, logged in or not. Deliberately leaves out the
 * email and the phone number: those are only for the owner, through {@link ProfessionalResponse}.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProfessionalPublicResponse {
    /** The entity's publicId, the internal numeric id is not exposed. */
    private UUID id;
    private String name;
    private String profileImageUrl;
    private String workingLocation;
    private String description;
    private Double rating;
    private List<ExpertiseTradeResponse> expertiseTrades;
}
