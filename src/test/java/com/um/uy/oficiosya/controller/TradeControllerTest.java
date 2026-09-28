package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.service.interfaces.TradeService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TradeControllerTest {

    @Test
    void listTrades_isTheCatalog() throws Exception {
        TradeService tradeService = mock(TradeService.class);
        when(tradeService.listTrades()).thenReturn(List.of(new TradeResponse(1L, "Plomería")));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TradeController(tradeService)).build();

        mvc.perform(get("/api/v1/trades"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Plomería"));
    }
}
