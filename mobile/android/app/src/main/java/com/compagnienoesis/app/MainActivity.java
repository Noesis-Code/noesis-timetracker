package com.compagnienoesis.app;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // L'application n'a qu'un mode sombre : barre d'état claire et champs sombres même si le téléphone est en mode clair.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
        super.onCreate(savedInstanceState);
    }
}
