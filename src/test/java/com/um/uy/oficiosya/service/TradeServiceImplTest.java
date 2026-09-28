package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.dto.request.TradeCreateRequest;
import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.mapper.TradeMapper;
import com.um.uy.oficiosya.repository.TradeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The trade catalog: unique names, listed alphabetically. */
class TradeServiceImplTest {

    @Mock
    private TradeRepository tradeRepository;
    @Mock
    private TradeMapper tradeMapper;

    private TradeServiceImpl service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new TradeServiceImpl(tradeRepository, tradeMapper);
    }

    private TradeCreateRequest request(String name) {
        TradeCreateRequest request = new TradeCreateRequest();
        request.setName(name);
        return request;
    }

    @Test
    void createTrade_savesANewName() {
        TradeCreateRequest request = request("Plomería");
        Trade trade = Trade.builder().name("Plomería").build();
        TradeResponse response = new TradeResponse();
        when(tradeMapper.toEntity(request)).thenReturn(trade);
        when(tradeRepository.save(trade)).thenReturn(trade);
        when(tradeMapper.toResponse(trade)).thenReturn(response);

        assertSame(response, service.createTrade(request));
    }

    @Test
    void createTrade_existingName_isAConflict() {
        when(tradeRepository.existsByNameIgnoreCase("plomería")).thenReturn(true);
        TradeCreateRequest request = request("plomería");

        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.createTrade(request));
        assertEquals(409, e.getStatusCode().value());
        verify(tradeRepository, never()).save(any());
    }

    @Test
    void listTrades_sortsByName() {
        Trade plumbing = Trade.builder().name("Plomería").build();
        Trade carpentry = Trade.builder().name("Carpintería").build();
        when(tradeRepository.findAll()).thenReturn(List.of(plumbing, carpentry));
        when(tradeMapper.toResponse(any(Trade.class)))
                .thenAnswer(invocation -> {
                    TradeResponse response = new TradeResponse();
                    response.setName(invocation.<Trade>getArgument(0).getName());
                    return response;
                });

        List<TradeResponse> trades = service.listTrades();

        assertEquals(List.of("Carpintería", "Plomería"), trades.stream().map(TradeResponse::getName).toList());
    }
}
