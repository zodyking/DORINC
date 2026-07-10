<?php

use Monolog\Handler\StreamHandler;
use Monolog\Level;
use Monolog\Logger;

return [
    'default' => env('LOG_CHANNEL', 'stderr'),
    'channels' => [
        'stderr' => [
            'driver' => 'monolog',
            'handler' => StreamHandler::class,
            'with' => [
                'stream' => 'php://stderr',
            ],
            'level' => env('LOG_LEVEL', Level::Warning->value),
        ],
    ],
];
