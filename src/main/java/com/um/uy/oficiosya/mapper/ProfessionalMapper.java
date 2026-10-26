package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ServiceAreaRequest;
import com.um.uy.oficiosya.dto.response.ExpertiseTradeResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalPublicResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.response.ServiceAreaResponse;
import com.um.uy.oficiosya.entity.ExpertiseTrade;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.ServiceArea;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

@Mapper(componentModel = "spring")
public interface ProfessionalMapper {
    Professional toEntity(ProfessionalCreateRequest dto);

    @Mapping(target = "id", source = "publicId")
    @Mapping(target = "role", constant = "PROFESSIONAL")
    @Mapping(target = "hasPassword", expression = "java(professional.getAuthProvider() == com.um.uy.oficiosya.entity.AuthProvider.LOCAL)")
    ProfessionalResponse toResponse(Professional professional);

    @Mapping(target = "id", source = "publicId")
    @Mapping(target = "serviceArea", qualifiedByName = "approximate")
    @Mapping(target = "distanceKm", ignore = true)
    ProfessionalPublicResponse toPublicResponse(Professional professional);

    ServiceArea toServiceArea(ServiceAreaRequest dto);

    ServiceAreaResponse toResponse(ServiceArea serviceArea);

    /** Two decimals, about a kilometre: enough to draw the circle without pointing at a house. */
    @Named("approximate")
    static ServiceAreaResponse approximate(ServiceArea serviceArea) {
        if (serviceArea == null) return null;
        return new ServiceAreaResponse(round(serviceArea.getLatitude()), round(serviceArea.getLongitude()), serviceArea.getRadiusKm());
    }

    private static Double round(Double degrees) {
        return degrees == null ? null : Math.round(degrees * 100) / 100.0;
    }

    @Mapping(target = "tradeId", source = "trade.id")
    @Mapping(target = "tradeName", source = "trade.name")
    ExpertiseTradeResponse toResponse(ExpertiseTrade expertiseTrade);
}
