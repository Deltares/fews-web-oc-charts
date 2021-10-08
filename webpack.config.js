const path = require('path')
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/wb-charts.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    library: 'wbCharts',
    libraryTarget: 'umd',
    filename: 'wb-charts.umd.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
        },
      }),
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/*.css', to: '', flatten: true, },
      ],
    }),
  ],
  module: {
    rules: [
      {
        // Include ts, tsx, and js files.
        test: /\.(tsx?)|(js)$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
      },
    ],
  },
  devtool: 'source-map',
  externals: ['d3']
}
