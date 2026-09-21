package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.entity.Trade;
import com.um.uy.oficiosya.repository.TradeRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/** Loads the usual home-service trades on startup, skipping any that already exist by name. */
@Component
public class TradeSeeder implements CommandLineRunner {

    private static final List<String> DEFAULT_TRADES = List.of(
            "Electricista",
            "Sanitaria",
            "Pintura",
            "Cerrajería",
            "Carpintería",
            "Jardinería",
            "Limpieza",
            "Herrería",
            "Plomero",
            "Reparación de Calefón"
    );

    private final TradeRepository tradeRepository;

    public TradeSeeder(TradeRepository tradeRepository) {
        this.tradeRepository = tradeRepository;
    }

    @Override
    public void run(String... args) {
        DEFAULT_TRADES.stream()
                .filter(name -> !tradeRepository.existsByNameIgnoreCase(name))
                .map(name -> Trade.builder().name(name).build())
                .forEach(tradeRepository::save);
    }
}
