package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.TradeCreateRequest;
import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.entity.Trade;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface TradeMapper {
    @Mapping(target = "id", ignore = true)
    Trade toEntity(TradeCreateRequest dto);

    TradeResponse toResponse(Trade trade);
}
