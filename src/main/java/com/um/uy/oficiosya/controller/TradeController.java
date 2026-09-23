package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.service.interfaces.TradeService;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Anyone can browse the trade catalog (needed to search, build a job request or a profile). */
@RestController
@RequestMapping("/api/v1/trades")
public class TradeController {

    private final TradeService tradeService;

    public TradeController(TradeService tradeService) {
        this.tradeService = tradeService;
    }

    @SecurityRequirements
    @GetMapping
    public ResponseEntity<List<TradeResponse>> listTrades() {
        return ResponseEntity.ok(tradeService.listTrades());
    }
}
