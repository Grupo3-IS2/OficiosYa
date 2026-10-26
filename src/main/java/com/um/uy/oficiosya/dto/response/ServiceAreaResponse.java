package com.um.uy.oficiosya.dto.response;

/** A professional's service area. Exact for its owner; in public responses the centre is rounded. */
public record ServiceAreaResponse(Double latitude, Double longitude, Integer radiusKm) {
}
