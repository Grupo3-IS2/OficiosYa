package com.um.uy.oficiosya.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;

/** A user's response plus what only a professional has. */
@EqualsAndHashCode(callSuper = true)
@ToString(callSuper = true)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProfessionalResponse extends ClientResponse {
    private String phoneNumber;
    private String workingLocation;
    private ServiceAreaResponse serviceArea;
    private String description;
    /** Only the professional and admins see it: this response isn't the public profile. */
    private String payoutAccount;
    /** Whether payoutAccount is a Mercado Pago account the professional linked by logging in, not typed. */
    private boolean payoutVerified;
    private boolean published;
    private Double rating;
    private List<ExpertiseTradeResponse> expertiseTrades;
}
