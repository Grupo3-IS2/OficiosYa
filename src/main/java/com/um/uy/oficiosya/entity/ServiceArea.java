package com.um.uy.oficiosya.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The circle a professional covers: a centre and how many kilometres from it they go. The centre can be
 * their home, so only its owner sees it exactly. Every column is null until the professional picks it.
 */
@Embeddable
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServiceArea {
    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "service_radius_km")
    private Integer radiusKm;

    /** Distance from the centre, in km */
    public double distanceKm(double lat, double lon) {
        double a = Math.pow(Math.sin(Math.toRadians(latitude - lat) / 2), 2)
                + Math.cos(Math.toRadians(lat)) * Math.cos(Math.toRadians(latitude))
                * Math.pow(Math.sin(Math.toRadians(longitude - lon) / 2), 2);
        return 6371 * 2 * Math.asin(Math.sqrt(a));
    }
}
