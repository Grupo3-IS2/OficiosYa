package com.um.uy.oficiosya.dto.request;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * What the professional search is narrowed and ordered by; every filter is optional. A professional
 * is available between {@code availableFrom} and {@code availableTo} if a free block of theirs
 * overlaps that stretch (both or neither are given). With a point ({@code lat} and {@code lon}, both or
 * neither), only professionals whose service area covers it, and within {@code maxDistanceKm} if given.
 */
public record ProfessionalSearchFilters(List<Long> tradeIds, BigDecimal minPrice, BigDecimal maxPrice,
                                        Double minRating, String location, String query,
                                        OffsetDateTime availableFrom, OffsetDateTime availableTo,
                                        Double lat, Double lon, Integer maxDistanceKm, Order order) {

    /**
     * RELEVANCE is by name, so pages don't shuffle. Prices are each professional's lowest hourly
     * rate among the trades searched for (all of them, without a trade filter). DISTANCE needs a point.
     * Missing values go last.
     */
    public enum Order { RELEVANCE, PRICE_ASC, PRICE_DESC, RATING_DESC, DISTANCE }

    public static ProfessionalSearchFilters byName(String query) {
        return new ProfessionalSearchFilters(null, null, null, null, null, query, null, null, null, null, null, Order.RELEVANCE);
    }
}
