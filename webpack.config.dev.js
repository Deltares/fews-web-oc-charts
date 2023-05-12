import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default {
  mode: 'development',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    library: 'wbCharts',
    libraryTarget: 'umd',
    filename: 'wb-charts.umd.js',
  },
  devServer: {
    static: {
        directory: path.join(__dirname, 'examples'),
      },
    compress: true,
    port: 9000,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
};
