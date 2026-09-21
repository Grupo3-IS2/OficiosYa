package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.TradeCreateRequest;
import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.mapper.TradeMapper;
import com.um.uy.oficiosya.repository.TradeRepository;
import com.um.uy.oficiosya.service.interfaces.TradeService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;

@Service
public class TradeServiceImpl implements TradeService {

    private final TradeRepository tradeRepository;
    private final TradeMapper tradeMapper;

    public TradeServiceImpl(TradeRepository tradeRepository, TradeMapper tradeMapper) {
        this.tradeRepository = tradeRepository;
        this.tradeMapper = tradeMapper;
    }

    @Override
    @Transactional
    public TradeResponse createTrade(TradeCreateRequest tradeRequest) {
        if (tradeRepository.existsByNameIgnoreCase(tradeRequest.getName())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ya existe un oficio llamado '" + tradeRequest.getName() + "'");
        }

        Trade trade = tradeMapper.toEntity(tradeRequest);
        trade = tradeRepository.save(trade);
        return tradeMapper.toResponse(trade);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TradeResponse> listTrades() {
        return tradeRepository.findAll().stream()
                .sorted(Comparator.comparing(Trade::getName))
                .map(tradeMapper::toResponse)
                .toList();
    }
}
