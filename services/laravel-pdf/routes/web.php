<?php

use Illuminate\Support\Facades\Route;

Route::get('/up', function () {
    return response()->json([
        'ok' => true,
        'service' => 'laravel-pdf',
        'engine' => 'barryvdh/laravel-dompdf',
        'wrapper' => 'laravel-blade',
    ]);
});
