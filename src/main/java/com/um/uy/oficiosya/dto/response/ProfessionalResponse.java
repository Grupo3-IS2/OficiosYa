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
public class ProfessionalResponse extends UserResponse {
    private String phoneNumber;
    private String workingLocation;
    private String description;
    private boolean published;
    private Double rating;
    private List<ExpertiseTradeResponse> expertiseTrades;
}
