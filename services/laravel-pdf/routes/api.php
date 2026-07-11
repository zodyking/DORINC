<?php

use App\Http\Controllers\PdfRenderController;
use Illuminate\Support\Facades\Route;

Route::post('/render/invoice', [PdfRenderController::class, 'invoice']);
Route::post('/render/invoice/html', [PdfRenderController::class, 'invoiceHtml']);
Route::post('/render/estimate', [PdfRenderController::class, 'estimate']);
Route::post('/render/estimate/html', [PdfRenderController::class, 'estimateHtml']);
