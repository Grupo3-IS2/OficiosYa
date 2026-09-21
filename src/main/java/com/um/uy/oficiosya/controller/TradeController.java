package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.service.interfaces.TradeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Any authenticated user can browse the trade catalog (needed to build a job request or a profile). */
@RestController
@RequestMapping("/api/v1/trade")
public class TradeController {

    private final TradeService tradeService;

    public TradeController(TradeService tradeService) {
        this.tradeService = tradeService;
    }

    @GetMapping
    public ResponseEntity<List<TradeResponse>> listTrades() {
        return ResponseEntity.ok(tradeService.listTrades());
    }
}
