package com.um.uy.oficiosya.service.interfaces;

import com.um.uy.oficiosya.dto.request.TradeCreateRequest;
import com.um.uy.oficiosya.dto.response.TradeResponse;

import java.util.List;

public interface TradeService {
    TradeResponse createTrade(TradeCreateRequest tradeRequest);
    List<TradeResponse> listTrades();
}
