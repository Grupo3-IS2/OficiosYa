package com.um.uy.oficiosya;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class OficiosYa {

    public static void main(String[] args) {
        SpringApplication.run(OficiosYa.class, args);
	}

}
