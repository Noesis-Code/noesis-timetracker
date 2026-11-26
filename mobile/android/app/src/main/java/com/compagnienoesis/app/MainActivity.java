package com.compagnienoesis.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Le site ferme l'écran le plus haut (pop-up, page, fenêtre) à la touche Échap (public/js/a11y-popups.js) et
    // annule l'événement quand il a fermé quelque chose. Retour = Échap ; rien à fermer = l'app passe en arrière-plan.
    private static final String ESCAPE_JS =
        "(function(){var e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});"
        + "document.dispatchEvent(e);return e.defaultPrevented;})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // L'application n'a qu'un mode sombre : barre d'état claire et champs sombres même si le téléphone est en mode clair.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web == null) { moveTaskToBack(true); return; }
                web.evaluateJavascript(ESCAPE_JS, value -> {
                    if (!"true".equals(value)) moveTaskToBack(true);
                });
            }
        });
    }
}
