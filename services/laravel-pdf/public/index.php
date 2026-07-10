<?php
/**
 * DORINC Laravel PDF service — DomPDF HTML → PDF (InvoiceShelf / barryvdh/laravel-dompdf engine).
 */

declare(strict_types=1);

use Dompdf\Dompdf;
use Dompdf\Options;

require dirname(__DIR__) . '/vendor/autoload.php';

header('X-Powered-By: DORINC-Laravel-PDF');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($method === 'GET' && ($path === '/health' || $path === '/')) {
    header('Content-Type: application/json');
    echo json_encode([
        'ok' => true,
        'service' => 'laravel-pdf',
        'engine' => 'dompdf',
        'wrapper' => 'barryvdh/laravel-dompdf-compatible',
    ]);
    exit;
}

if ($method !== 'POST' || $path !== '/render') {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => 'Not found']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => 'Expected JSON body']);
    exit;
}

$html = $payload['html'] ?? null;
if (!is_string($html) || trim($html) === '') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => 'html is required']);
    exit;
}

$paper = normalizePaper(is_string($payload['paper'] ?? null) ? $payload['paper'] : 'letter');
$margins = is_array($payload['margins'] ?? null) ? $payload['margins'] : [];
$marginTop = isset($margins['top']) ? (float) $margins['top'] : 0.5;
$marginRight = isset($margins['right']) ? (float) $margins['right'] : 0.5;
$marginBottom = isset($margins['bottom']) ? (float) $margins['bottom'] : 0.5;
$marginLeft = isset($margins['left']) ? (float) $margins['left'] : 0.5;

$html = injectPageMargins($html, $paper, $marginTop, $marginRight, $marginBottom, $marginLeft);

$options = new Options();
$options->set('isRemoteEnabled', true);
$options->set('isHtml5ParserEnabled', true);
$options->set('defaultFont', 'DejaVu Sans');

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html);
$dompdf->setPaper($paper, 'portrait');

try {
    $dompdf->render();
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
    exit;
}

header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="document.pdf"');
echo $dompdf->output();

function normalizePaper(string $paper): string
{
    $value = strtolower(trim($paper));
    return $value === 'a4' ? 'a4' : 'letter';
}

function pageSizeCss(string $paper): string
{
    return $paper === 'a4' ? 'A4' : 'Letter';
}

function injectPageMargins(
    string $html,
    string $paper,
    float $top,
    float $right,
    float $bottom,
    float $left,
): string {
    $rule = sprintf(
        '@page { size: %s; margin: %.4fin %.4fin %.4fin %.4fin; }',
        pageSizeCss($paper),
        $top,
        $right,
        $bottom,
        $left,
    );

    if (preg_match('/@page\s*\{[^}]*\}/i', $html) === 1) {
        return (string) preg_replace('/@page\s*\{[^}]*\}/i', $rule, $html, 1);
    }

    $style = "<style data-pdf-page=\"true\">\n{$rule}\n</style>\n";
    if (stripos($html, '</head>') !== false) {
        return (string) preg_replace('/<\/head>/i', $style . '</head>', $html, 1);
    }

    return $style . $html;
}
