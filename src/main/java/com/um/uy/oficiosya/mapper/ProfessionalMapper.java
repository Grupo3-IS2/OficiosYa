package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.response.ExpertiseTradeResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.entity.ExpertiseTrade;
import com.um.uy.oficiosya.entity.Professional;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ProfessionalMapper {
    Professional toEntity(ProfessionalCreateRequest dto);

    @Mapping(target = "id", source = "publicId")
    @Mapping(target = "role", constant = "PROFESSIONAL")
    ProfessionalResponse toResponse(Professional professional);

    @Mapping(target = "tradeId", source = "trade.id")
    @Mapping(target = "tradeName", source = "trade.name")
    ExpertiseTradeResponse toResponse(ExpertiseTrade expertiseTrade);
}
